import { OWNED_GROWTH_BRAND_IDS, growthBrandDefinition, isMetaGrowthChannel, isPilotChannel } from "@/lib/marketing/brand-registry";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import { buildMarketingNextActions, type MarketingDecisionRow } from "@/lib/marketing/next-best-action";
import {
  nextActionPublicationMode,
  nextActionRequestIdentity,
} from "@/lib/marketing/next-action-execution";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

const REQUIRED_OBSERVATIONS = 10;
const ACTION_COOLDOWN_HOURS = 20;

type PlanRow = {
  brand_id?: string | null;
  status?: string | null;
  autonomy_mode?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type NextActionQueueResult =
  | {
      queued: true;
      requestId: string;
      actionId: string;
      brandId: string;
      channel: string;
      sourceChannel: string | null;
      publicationMode: "LIVE_ELIGIBLE" | "REVIEW_ONLY";
      reason: string;
    }
  | {
      queued: false;
      reason: string;
      actionId?: string;
      brandId?: string;
      channel?: string;
      publicationMode?: "LIVE_ELIGIBLE" | "REVIEW_ONLY";
    };

function configuredChannels(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean)));
}

function asMetadata(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function enqueueNextBestMarketingAction(
  supabase: MarketingSupabaseLike,
  opts: { now?: Date } = {},
): Promise<NextActionQueueResult> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const sinceIso = new Date(now.getTime() - ACTION_COOLDOWN_HOURS * 3_600_000).toISOString();
  const brandIds = [...OWNED_GROWTH_BRAND_IDS];

  const [plansR, contextsR, channelsR, publicationsR, eventsR, rulesR] = await Promise.all([
    supabase
      .from("marketing_brand_growth_plans")
      .select("brand_id,status,autonomy_mode,metadata")
      .in("brand_id", brandIds)
      .eq("status", "active")
      .eq("autonomy_mode", "controlled_auto"),
    supabase.from("brand_context").select("brand_id,brand_name").in("brand_id", brandIds),
    supabase.from("social_channels").select("brand_id,platform,is_active").in("brand_id", brandIds).eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id,channel,state,content_id,created_at,updated_at").in("brand_id", brandIds).limit(10000),
    supabase.from("marketing_events").select("brand_id,channel,content_id,metadata").in("brand_id", brandIds).eq("event_type", "metrics_snapshot").limit(10000),
    supabase.from("marketing_learning_rules").select("scope,verdict").limit(10000),
  ]);

  const error = plansR.error || contextsR.error || channelsR.error || publicationsR.error || eventsR.error || rulesR.error;
  if (error) throw new Error(`NEXT_ACTION_SNAPSHOT_FAILED: ${error.message}`);

  const plans = (plansR.data ?? []) as PlanRow[];
  if (!plans.length) return { queued: false, reason: "NO_CONTROLLED_AUTO_PLANS" };
  const controlledBrands = new Set(plans.map((row) => String(row.brand_id ?? "")).filter(Boolean));
  const contextByBrand = new Map((contextsR.data ?? []).map((row: any) => [String(row.brand_id), row]));
  const publications = publicationsR.data ?? [];
  const events = eventsR.data ?? [];
  const rules = rulesR.data ?? [];

  const rows: MarketingDecisionRow[] = (channelsR.data ?? [])
    .filter((channel: any) => {
      const brandId = String(channel.brand_id ?? "");
      const platform = String(channel.platform ?? "").toLowerCase();
      return controlledBrands.has(brandId) && isMetaGrowthChannel(platform);
    })
    .map((channel: any): MarketingDecisionRow => {
      const brandId = String(channel.brand_id);
      const platform = String(channel.platform).toLowerCase();
      const definition = growthBrandDefinition(brandId);
      const context = contextByBrand.get(brandId);
      const channelPublications = publications.filter((row: any) =>
        String(row.brand_id) === brandId
        && String(row.channel).toLowerCase() === platform
        && String(row.state) === "published",
      );
      const channelEvents = events.filter((row: any) =>
        String(row.brand_id) === brandId
        && String(row.channel).toLowerCase() === platform,
      );
      const eligible = new Set(
        channelEvents
          .filter((row: any) => row?.metadata?.learning_eligible !== false)
          .map((row: any) => String(row.content_id ?? ""))
          .filter(Boolean),
      ).size;
      const quarantined = new Set(
        channelEvents
          .filter((row: any) => row?.metadata?.learning_eligible === false)
          .map((row: any) => String(row.content_id ?? ""))
          .filter(Boolean),
      ).size;
      const scope = channelLearningScope(brandId, platform);
      const scopedRules = rules.filter((row: any) => String(row.scope) === scope);
      const evaluatedRules = scopedRules.length;
      const actionableRules = scopedRules.filter((row: any) => ["favor", "avoid"].includes(String(row.verdict))).length;
      const brandBrainReady = Boolean(context);
      const pilotReady = brandBrainReady && isPilotChannel(brandId, platform);
      const liveLearning = pilotReady && eligible >= REQUIRED_OBSERVATIONS && evaluatedRules > 0;

      return {
        brandId,
        brandName: (context as any)?.brand_name ?? definition?.name ?? brandId,
        platform,
        connected: true,
        brandBrainReady,
        planned: Boolean(definition?.plannedChannels.includes(platform as any)),
        pilotReady,
        published: channelPublications.length,
        measuredEligible: eligible,
        quarantined,
        evaluatedRules,
        actionableRules,
        liveLearning,
        surfaceKind: "destination",
      };
    });

  const action = buildMarketingNextActions(rows, REQUIRED_OBSERVATIONS)
    .find((candidate) =>
      candidate.kind === "PREPARE_CANARY"
      && candidate.execution === "AUTO_READY"
      && candidate.channel
      && controlledBrands.has(candidate.brandId),
    );

  if (!action?.channel) return { queued: false, reason: "NO_AUTO_READY_CANARY" };

  const plan = plans.find((row) => String(row.brand_id) === action.brandId);
  if (!plan) return { queued: false, reason: "CONTROLLED_AUTO_PLAN_NOT_FOUND", actionId: action.id, brandId: action.brandId, channel: action.channel };
  const liveChannels = configuredChannels(asMetadata(plan.metadata));
  const publicationMode = nextActionPublicationMode({
    configuredChannels: liveChannels,
    targetChannel: action.channel,
  });

  const recentPublication = publications.find((row: any) => {
    if (String(row.brand_id) !== action.brandId || String(row.channel).toLowerCase() !== action.channel) return false;
    if (!["draft", "approved", "publishing", "published", "scheduled", "paused"].includes(String(row.state))) return false;
    const at = Date.parse(String(row.created_at ?? row.updated_at ?? ""));
    return Number.isFinite(at) && at >= Date.parse(sinceIso);
  });
  if (recentPublication) {
    return {
      queued: false,
      reason: "RECENT_TARGET_PUBLICATION_EXISTS",
      actionId: action.id,
      brandId: action.brandId,
      channel: action.channel,
      publicationMode,
    };
  }

  const { data: recentRequests, error: requestReadError } = await supabase
    .from("marketing_autopilot_run_requests")
    .select("id,status,requested_at,requested_by")
    .contains("brand_ids", [action.brandId])
    .contains("channels", [action.channel])
    .gte("requested_at", sinceIso)
    .order("requested_at", { ascending: false })
    .limit(10);
  if (requestReadError) throw new Error(`NEXT_ACTION_REQUEST_CHECK_FAILED: ${requestReadError.message}`);

  const duplicate = (recentRequests ?? []).find((row: any) =>
    String(row.requested_by ?? "").startsWith("growth-autopilot:")
    && ["pending", "claimed", "completed", "failed"].includes(String(row.status)),
  );
  if (duplicate) {
    return {
      queued: false,
      reason: "RECENT_SYSTEM_CANARY_REQUEST_EXISTS",
      actionId: action.id,
      brandId: action.brandId,
      channel: action.channel,
      publicationMode,
    };
  }

  const requestedBy = nextActionRequestIdentity(action.id);
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("marketing_autopilot_run_requests")
    .insert({
      requested_at: nowIso,
      expires_at: expiresAt,
      requested_by: requestedBy,
      brand_ids: [action.brandId],
      channels: [action.channel],
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`NEXT_ACTION_REQUEST_INSERT_FAILED: ${insertError.message}`);
  if (!inserted?.id) throw new Error("NEXT_ACTION_REQUEST_INSERT_FAILED: missing request id");

  return {
    queued: true,
    requestId: String(inserted.id),
    actionId: action.id,
    brandId: action.brandId,
    channel: action.channel,
    sourceChannel: action.sourceChannel,
    publicationMode,
    reason: publicationMode === "LIVE_ELIGIBLE"
      ? "CONTROLLED_CANARY_QUEUED_LIVE_ELIGIBLE"
      : "CONTROLLED_CANARY_QUEUED_REVIEW_ONLY",
  };
}
