import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const OWNED_BRANDS = ["zeneco", "pinosoecolife", "donaanna", "chatgenius", "freddyb", "remasterfreddy"] as const;
const META_PILOT_CHANNELS = new Set(["instagram", "facebook"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const [{ data: contexts }, { data: channels }, { data: publications }, { data: events }, { data: rules }] = await Promise.all([
    supabase.from("brand_context").select("brand_id, brand_name").in("brand_id", [...OWNED_BRANDS]),
    supabase.from("social_channels").select("brand_id, platform, external_id, display_name, is_active").in("brand_id", [...OWNED_BRANDS]).eq("is_active", true),
    supabase.from("marketing_publications").select("brand_id, channel, state").in("brand_id", [...OWNED_BRANDS]).eq("state", "published"),
    supabase.from("marketing_events").select("brand_id, channel, content_id, metadata").in("brand_id", [...OWNED_BRANDS]).eq("event_type", "metrics_snapshot"),
    supabase.from("marketing_learning_rules").select("scope, dimension, verdict").in("scope", [...OWNED_BRANDS]),
  ]);

  const contextByBrand = new Map((contexts ?? []).map((row: any) => [String(row.brand_id), row]));
  const rows = (channels ?? []).map((channel: any) => {
    const brandId = String(channel.brand_id);
    const platform = String(channel.platform);
    const brandContext = contextByBrand.get(brandId);
    const published = (publications ?? []).filter((p: any) => String(p.brand_id) === brandId && String(p.channel) === platform).length;
    const channelEvents = (events ?? []).filter((e: any) => String(e.brand_id) === brandId && String(e.channel) === platform);
    const eligible = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible !== false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const quarantined = new Set(channelEvents.filter((e: any) => e?.metadata?.learning_eligible === false).map((e: any) => String(e.content_id || "")).filter(Boolean)).size;
    const actionableRules = (rules ?? []).filter((r: any) => String(r.scope) === brandId && ["favor", "avoid"].includes(String(r.verdict))).length;
    const connected = true;
    const brandBrainReady = Boolean(brandContext);
    const pilotReady = connected && brandBrainReady && META_PILOT_CHANNELS.has(platform);
    const liveLearning = eligible >= 10 && actionableRules > 0;

    return {
      brandId,
      brandName: (brandContext as any)?.brand_name ?? brandId,
      platform,
      accountId: String(channel.external_id),
      accountName: channel.display_name,
      connected,
      brandBrainReady,
      pilotReady,
      published,
      measuredEligible: eligible,
      quarantined,
      actionableRules,
      liveLearning,
      status: liveLearning ? "LIVE_LEARNING" : pilotReady ? "PILOT_READY" : brandBrainReady ? "BRAND_BRAIN_READY" : "CONNECTED",
    };
  });

  for (const brandId of OWNED_BRANDS) {
    if (rows.some((r: any) => r.brandId === brandId)) continue;
    const context = contextByBrand.get(brandId);
    rows.push({
      brandId,
      brandName: (context as any)?.brand_name ?? brandId,
      platform: null,
      accountId: null,
      accountName: null,
      connected: false,
      brandBrainReady: Boolean(context),
      pilotReady: false,
      published: 0,
      measuredEligible: 0,
      quarantined: 0,
      actionableRules: 0,
      liveLearning: false,
      status: context ? "BRAND_BRAIN_READY" : "NOT_READY",
    });
  }

  rows.sort((a: any, b: any) => `${a.brandName}|${a.platform ?? ""}`.localeCompare(`${b.brandName}|${b.platform ?? ""}`));
  return NextResponse.json({ generatedAt: new Date().toISOString(), rows });
}
