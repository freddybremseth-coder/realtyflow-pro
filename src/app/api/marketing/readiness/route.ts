import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { OWNED_GROWTH_BRAND_IDS, growthBrandDefinition, isPilotChannel } from "@/lib/marketing/brand-registry";
import type { MarketingChannel } from "@/lib/marketing/genome";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

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
  actionableRules: number;
  liveLearning: boolean;
  status: "LIVE_LEARNING" | "PILOT_READY" | "BRAND_BRAIN_READY" | "CONNECTED" | "NOT_READY";
};

function blocker(params: { connected: boolean; brandBrainReady: boolean; planned: boolean; pilotReady: boolean; platform: string | null }) {
  if (params.pilotReady) return null;
  if (!params.connected) return "Konto er ikke koblet.";
  if (!params.brandBrainReady) return "Brand Brain mangler.";
  if (!params.planned) return "Kanalen er koblet, men er ikke del av Growth OS-utvidelsesplanen.";
  if (params.platform === "youtube" || params.platform === "linkedin") {
    return "Kanal koblet og planlagt, men brand-scopet write-governance + approval-publisher er ikke pilotklar ennå.";
  }
  return "Kanalen er ikke godkjent som Growth OS-pilot ennå.";
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const brandIds = [...OWNED_GROWTH_BRAND_IDS];
  const [{ data: contexts }, { data: channels }, { data: publications }, { data: events }, { data: rules }] = await Promise.all([
    supabase.from("brand_context").select("brand_id, brand_name").in("brand_id", brandIds),
    supabase.from("social_channels").select("brand_id, platform, external_id, display_name, is_active").in("brand_id", brandIds).eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id, channel, state").in("brand_id", brandIds).eq("state", "published"),
    supabase.from("marketing_events").select("brand_id, channel, content_id, metadata").in("brand_id", brandIds).eq("event_type", "metrics_snapshot"),
    supabase.from("marketing_learning_rules").select("scope, dimension, verdict").in("scope", brandIds),
  ]);

  const contextByBrand = new Map((contexts ?? []).map((row: any) => [String(row.brand_id), row]));
  const rows: ReadinessRow[] = (channels ?? []).map((channel: any): ReadinessRow => {
    const brandId = String(channel.brand_id);
    const platform = String(channel.platform);
    const definition = growthBrandDefinition(brandId);
    const brandContext = contextByBrand.get(brandId);
    const published = (publications ?? []).filter((p: any) => String(p.brand_id) === brandId && String(p.channel) === platform).length;
    const channelEvents = (events ?? []).filter((e: any) => String(e.brand_id) === brandId && String(e.channel) === platform);
    const eligible = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible !== false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const quarantined = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible === false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const actionableRules = (rules ?? []).filter((r: any) => String(r.scope) === brandId && ["favor", "avoid"].includes(String(r.verdict))).length;
    const connected = true;
    const brandBrainReady = Boolean(brandContext);
    const planned = Boolean(definition?.plannedChannels.includes(platform as MarketingChannel));
    const pilotReady = connected && brandBrainReady && isPilotChannel(brandId, platform);
    const pilotBlockReason = blocker({ connected, brandBrainReady, planned, pilotReady, platform });
    const liveLearning = pilotReady && eligible >= 10 && actionableRules > 0;

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
      actionableRules,
      liveLearning,
      status: liveLearning ? "LIVE_LEARNING" : pilotReady ? "PILOT_READY" : brandBrainReady ? "BRAND_BRAIN_READY" : "CONNECTED",
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
      pilotBlockReason: blocker({ connected, brandBrainReady, planned, pilotReady, platform: null }),
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      actionableRules: 0,
      liveLearning: false,
      status: context ? "BRAND_BRAIN_READY" : "NOT_READY",
    });
  }

  rows.sort((a, b) => `${a.brandName}|${a.platform ?? ""}`.localeCompare(`${b.brandName}|${b.platform ?? ""}`));
  return NextResponse.json({ generatedAt: new Date().toISOString(), rows });
}
