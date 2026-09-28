import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { OWNED_GROWTH_BRAND_IDS, OWNED_GROWTH_BRANDS, growthBrandDefinition, isMetaGrowthChannel, isPilotChannel } from "@/lib/marketing/brand-registry";
import { channelLearningScope } from "@/lib/marketing/learning-scope";
import type { MarketingChannel } from "@/lib/marketing/genome";
import {
  buildMarketingNextActions,
  marketingSurfaceKind,
  type MarketingSurfaceKind,
} from "@/lib/marketing/next-best-action";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const CONTROL_MATURITY_HOURS = 24;
const CONTROL_REQUIRED_OBSERVATIONS = 10;

type ReadinessRow = {
  brandId: string;
  brandName: string;
  platform: string | null;
  accountId: string | null;
  accountName: string | null;
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  pilotBlockReason: string | null;
  published: number;
  measuredEligible: number;
  quarantined: number;
  evaluatedRules: number;
  actionableRules: number;
  liveLearning: boolean;
  surfaceKind: MarketingSurfaceKind;
  attentionRequired: boolean;
  attentionReason: string | null;
  status: "LIVE_LEARNING" | "PILOT_READY" | "BRAND_BRAIN_READY" | "CONNECTED" | "NOT_READY" | "SIGNAL_READY";
};

function blocker(params: {
  connected: boolean;
  brandBrainReady: boolean;
  planned: boolean;
  pilotReady: boolean;
  platform: string | null;
  surfaceKind: MarketingSurfaceKind;
}) {
  if (params.surfaceKind === "signal") return null;
  if (params.pilotReady) return null;
  if (!params.connected) return "Konto er ikke koblet.";
  if (!params.brandBrainReady) return "Brand Brain mangler.";
  if (!params.planned) return "Kanalen er koblet, men er ikke del av Growth OS-utvidelsesplanen.";
  if (params.planned && params.platform && !isMetaGrowthChannel(params.platform)) {
    return "Kanal koblet og planlagt, men brand-scopet write-governance + approval-publisher er ikke pilotklar ennå.";
  }
  return "Kanalen er ikke godkjent som Growth OS-pilot ennå.";
}

function humanAttention(params: {
  connected: boolean;
  brandBrainReady: boolean;
  quarantined: number;
  surfaceKind: MarketingSurfaceKind;
}) {
  if (params.surfaceKind === "signal") return { required: false, reason: null };
  if (params.quarantined > 0) {
    return { required: true, reason: `${params.quarantined} learning-måling(er) er i karantene.` };
  }
  if (params.connected && !params.brandBrainReady) {
    return { required: true, reason: "Brand Brain mangler og krever eier-/brandbeslutning før autonom produksjon." };
  }
  return { required: false, reason: null };
}

function nextDailyMetricsCronAfter(afterMs: number): number {
  const after = new Date(afterMs);
  let cron = Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), 19, 30, 0);
  if (cron <= afterMs) cron += 86_400_000;
  return cron;
}

function nextEvaluationAt(
  published: Array<{ content_id?: unknown; updated_at?: unknown }>,
  nowMs: number,
  required = CONTROL_REQUIRED_OBSERVATIONS,
): string | null {
  let cronMs = nextDailyMetricsCronAfter(nowMs);
  const maturityMs = CONTROL_MATURITY_HOURS * 3_600_000;
  for (let i = 0; i < 8; i += 1) {
    const matureBefore = cronMs - maturityMs;
    const matureCount = new Set(
      published
        .filter((row) => {
          const t = row.updated_at ? new Date(String(row.updated_at)).getTime() : NaN;
          return Number.isFinite(t) && t <= matureBefore;
        })
        .map((row) => String(row.content_id ?? ""))
        .filter(Boolean),
    ).size;
    if (matureCount >= required) return new Date(cronMs).toISOString();
    cronMs += 86_400_000;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const brandIds = [...OWNED_GROWTH_BRAND_IDS];
  const ruleScopes = Array.from(new Set([
    ...brandIds,
    ...OWNED_GROWTH_BRANDS.flatMap((brand) =>
      brand.plannedChannels.map((channel) => channelLearningScope(brand.id, channel)),
    ),
  ]));
  const [{ data: contexts }, { data: channels }, { data: publications }, { data: events }, { data: rules }] = await Promise.all([
    supabase.from("brand_context").select("brand_id, brand_name").in("brand_id", brandIds),
    supabase.from("social_channels").select("brand_id, platform, external_id, display_name, is_active").in("brand_id", brandIds).eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id, channel, state, content_id, updated_at").in("brand_id", brandIds).eq("state", "published"),
    supabase.from("marketing_events").select("brand_id, channel, content_id, metadata").in("brand_id", brandIds).eq("event_type", "metrics_snapshot"),
    supabase.from("marketing_learning_rules").select("scope, dimension, verdict").in("scope", ruleScopes),
  ]);

  const contextByBrand = new Map((contexts ?? []).map((row: any) => [String(row.brand_id), row]));
  const rows: ReadinessRow[] = (channels ?? []).map((channel: any): ReadinessRow => {
    const brandId = String(channel.brand_id);
    const platform = String(channel.platform);
    const surfaceKind = marketingSurfaceKind(platform);
    const definition = growthBrandDefinition(brandId);
    const brandContext = contextByBrand.get(brandId);
    const published = surfaceKind === "destination"
      ? (publications ?? []).filter((p: any) => String(p.brand_id) === brandId && String(p.channel) === platform).length
      : 0;
    const channelEvents = surfaceKind === "destination"
      ? (events ?? []).filter((e: any) => String(e.brand_id) === brandId && String(e.channel) === platform)
      : [];
    const eligible = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible !== false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const quarantined = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible === false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const scope = channelLearningScope(brandId, platform);
    const scopedRules = surfaceKind === "destination"
      ? (rules ?? []).filter((r: any) => String(r.scope) === scope)
      : [];
    const evaluatedRules = scopedRules.length;
    const actionableRules = scopedRules.filter((r: any) => ["favor", "avoid"].includes(String(r.verdict))).length;
    const connected = true;
    const brandBrainReady = Boolean(brandContext);
    const planned = surfaceKind === "signal"
      ? true
      : Boolean(definition?.plannedChannels.includes(platform as MarketingChannel));
    const pilotReady = surfaceKind === "destination" && connected && brandBrainReady && isPilotChannel(brandId, platform);
    const pilotBlockReason = blocker({ connected, brandBrainReady, planned, pilotReady, platform, surfaceKind });
    const liveLearning = surfaceKind === "destination" && pilotReady && eligible >= CONTROL_REQUIRED_OBSERVATIONS && evaluatedRules > 0;
    const attention = humanAttention({ connected, brandBrainReady, quarantined, surfaceKind });

    return {
      brandId,
      brandName: (brandContext as any)?.brand_name ?? definition?.name ?? brandId,
      platform,
      accountId: String(channel.external_id),
      accountName: channel.display_name ?? null,
      connected,
      brandBrainReady,
      planned,
      pilotReady,
      pilotBlockReason,
      published,
      measuredEligible: eligible,
      quarantined,
      evaluatedRules,
      actionableRules,
      liveLearning,
      surfaceKind,
      attentionRequired: attention.required,
      attentionReason: attention.reason,
      status: surfaceKind === "signal"
        ? "SIGNAL_READY"
        : liveLearning
          ? "LIVE_LEARNING"
          : pilotReady
            ? "PILOT_READY"
            : brandBrainReady
              ? "BRAND_BRAIN_READY"
              : "CONNECTED",
    };
  });

  for (const brandId of OWNED_GROWTH_BRAND_IDS) {
    if (rows.some((r) => r.brandId === brandId)) continue;
    const context = contextByBrand.get(brandId);
    const definition = growthBrandDefinition(brandId);
    const connected = false;
    const brandBrainReady = Boolean(context);
    const planned = Boolean(definition?.plannedChannels.length);
    const pilotReady = false;
    const surfaceKind: MarketingSurfaceKind = "destination";
    const attention = humanAttention({ connected, brandBrainReady, quarantined: 0, surfaceKind });
    rows.push({
      brandId,
      brandName: (context as any)?.brand_name ?? definition?.name ?? brandId,
      platform: null,
      accountId: null,
      accountName: null,
      connected,
      brandBrainReady,
      planned,
      pilotReady,
      pilotBlockReason: blocker({ connected, brandBrainReady, planned, pilotReady, platform: null, surfaceKind }),
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      evaluatedRules: 0,
      actionableRules: 0,
      liveLearning: false,
      surfaceKind,
      attentionRequired: attention.required,
      attentionReason: attention.reason,
      status: context ? "BRAND_BRAIN_READY" : "NOT_READY",
    });
  }

  rows.sort((a, b) => `${a.brandName}|${a.surfaceKind}|${a.platform ?? ""}`.localeCompare(`${b.brandName}|${b.surfaceKind}|${b.platform ?? ""}`));

  const nextActions = buildMarketingNextActions(rows, CONTROL_REQUIRED_OBSERVATIONS);
  const nextCanary = nextActions.find((action) => action.kind === "PREPARE_CANARY") ?? null;
  const fallbackControl = rows
    .filter((row) => row.surfaceKind === "destination" && row.pilotReady)
    .sort((a, b) =>
      Number(b.liveLearning) - Number(a.liveLearning)
      || b.measuredEligible - a.measuredEligible
      || b.evaluatedRules - a.evaluatedRules,
    )[0] ?? null;
  const controlRow = nextCanary
    ? rows.find((row) => row.brandId === nextCanary.brandId && row.platform === nextCanary.sourceChannel) ?? fallbackControl
    : fallbackControl;
  const controlScope = controlRow?.platform ? channelLearningScope(controlRow.brandId, controlRow.platform) : "";
  const controlPublished = controlRow?.platform
    ? (publications ?? []).filter((p: any) => String(p.brand_id) === controlRow.brandId && String(p.channel) === controlRow.platform)
    : [];

  const controlGate = {
    status: nextCanary ? "RUN_NEXT_CANARY" : "WAIT",
    controlBrandId: controlRow?.brandId ?? "",
    controlChannel: controlRow?.platform ?? "",
    learningScope: controlScope,
    eligibleObservations: controlRow?.measuredEligible ?? 0,
    requiredObservations: CONTROL_REQUIRED_OBSERVATIONS,
    maturityHours: CONTROL_MATURITY_HOURS,
    evaluatedRules: controlRow?.evaluatedRules ?? 0,
    actionableRules: controlRow?.actionableRules ?? 0,
    nextEvaluationAt: nextCanary ? null : nextEvaluationAt(controlPublished, Date.now()),
    nextRecommendedCanary: nextCanary?.href
      ? { brandId: nextCanary.brandId, channel: nextCanary.channel, path: nextCanary.href }
      : null,
    reason: nextCanary
      ? `PREPARE_${nextCanary.brandId.toUpperCase()}_${String(nextCanary.channel).toUpperCase()}_CANARY`
      : controlRow && controlRow.measuredEligible < CONTROL_REQUIRED_OBSERVATIONS
        ? `WAIT_FOR_${CONTROL_REQUIRED_OBSERVATIONS}_ELIGIBLE_OBSERVATIONS (${controlRow.measuredEligible}/${CONTROL_REQUIRED_OBSERVATIONS})`
        : controlRow && controlRow.evaluatedRules === 0
          ? "WAIT_FOR_CHANNEL_LEARNING_EVALUATION"
          : "NO_CONTROLLED_CANARY_REQUIRED",
  };

  const automationSummary = {
    autoReady: nextActions.filter((action) => action.execution === "AUTO_READY").length,
    humanRequired: nextActions.filter((action) => action.execution === "HUMAN_REQUIRED").length,
    systemWork: nextActions.filter((action) => action.execution === "SYSTEM_WORK").length,
    waiting: nextActions.filter((action) => action.execution === "WAIT").length,
    connectedSignals: rows.filter((row) => row.surfaceKind === "signal" && row.connected).length,
    connectedDestinations: rows.filter((row) => row.surfaceKind === "destination" && row.connected).length,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    controlGate,
    nextActions,
    automationSummary,
    rows,
  });
}
