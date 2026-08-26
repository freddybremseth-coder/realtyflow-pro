export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { createCampaignDraft, getServiceSupabase } from "@/services/marketing/campaign-production";

const SUPPORTED_CHANNELS = new Set(["instagram", "facebook"]);

function configuredChannels(metadata: Record<string, unknown> | null | undefined): Array<"instagram" | "facebook"> {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  return Array.from(new Set(values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is "instagram" | "facebook" => SUPPORTED_CHANNELS.has(value))));
}

async function hasRecentAutoPublication(
  supabase: ReturnType<typeof getServiceSupabase> extends infer T ? Exclude<T, null> : never,
  brandId: string,
  channel: string,
) {
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("marketing_publications")
    .select("publication_id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .eq("source_type", "generated")
    .eq("reuse_mode", "inventory_grounded")
    .in("state", ["published", "scheduled"])
    .gte("updated_at", since)
    .limit(1);
  return !!data?.length;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-autopilot");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const brandId = process.env.MARKETING_AUTOPILOT_BRAND || "zeneco";
  const { data: plan, error } = await supabase
    .from("marketing_brand_growth_plans")
    .select("brand_id,status,autonomy_mode,metadata")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!plan || plan.status !== "active" || plan.autonomy_mode !== "controlled_auto") {
    return NextResponse.json({ success: true, skipped: true, reason: "Brand is not active controlled_auto", brandId });
  }

  const channels = configuredChannels((plan.metadata ?? {}) as Record<string, unknown>);
  if (!channels.length) {
    return NextResponse.json({ success: true, skipped: true, reason: "No preapproved autopilot channels", brandId });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const channel of channels) {
    if (await hasRecentAutoPublication(supabase, brandId, channel)) {
      results.push({ channel, skipped: true, reason: "recent_auto_publication_exists" });
      continue;
    }

    try {
      const run = await createCampaignDraft(supabase as any, {
        brandId,
        channel,
        useInventoryProperty: true,
        masterIdea: "Presenter én aktuell bolig fra RealtyFlow Inventory på en troverdig, nyttig og salgsutløsende måte. Bruk kun verifiserte Inventory-fakta og brandets godkjente tone, CTA og rolle.",
        goal: { kind: "qualified_leads", target: 10, horizonDays: 30 },
        publishingCapacityPerWeek: 4,
      });
      results.push({
        channel,
        marketingRunId: run.marketingRunId,
        publications: run.results.map((item) => ({
          publicationId: item.publicationId,
          state: item.state,
          mode: item.mode,
          qualityScore: item.qualityScore,
          error: item.error ?? null,
        })),
      });
    } catch (err) {
      results.push({ channel, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ success: true, brandId, channels, results });
}
