export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { syncGrowthInstagramMetrics } from "@/services/marketing/growth-metrics-sync";
import { syncGrowthFacebookMetrics } from "@/services/marketing/growth-facebook-metrics-sync";
import { enrichPublishedGrowthGenomes } from "@/services/marketing/growth-genome-enrichment";
import { resolveBrandInstagramAccessToken } from "@/services/marketing/instagram-token";

const EXCLUDED_BRANDS = new Set(["soleada"]);
const SUPPORTED_CHANNELS = new Set(["instagram", "facebook"]);

function configuredChannels(metadata: Record<string, unknown> | null | undefined): string[] {
  const raw = metadata?.autopilot_channels ?? metadata?.autopilot_scope;
  const values = Array.isArray(raw) ? raw.map(String) : typeof raw === "string" ? raw.split(",") : [];
  return Array.from(new Set(values.map((v) => v.trim().toLowerCase()).filter((v) => SUPPORTED_CHANNELS.has(v))));
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-growth-metrics");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const days = Number(process.env.MARKETING_METRICS_LOOKBACK_DAYS || 30);
  const limit = Number(process.env.MARKETING_METRICS_LIMIT || 100);
  const minAgeHours = Number(process.env.MARKETING_METRICS_MIN_AGE_HOURS || 24);
  const learningMinObservations = Number(process.env.MARKETING_LEARNING_MIN_OBSERVATIONS || 10);
  const timeZone = process.env.MARKETING_LEARNING_TIMEZONE || "Europe/Madrid";

  const { data: plans, error: plansError } = await supabase
    .from("marketing_brand_growth_plans")
    .select("brand_id,status,autonomy_mode,metadata")
    .eq("status", "active")
    .eq("autonomy_mode", "controlled_auto");
  if (plansError) return NextResponse.json({ error: plansError.message }, { status: 500 });

  const brands: Array<Record<string, unknown>> = [];
  for (const plan of plans ?? []) {
    const brandId = String(plan.brand_id ?? "").trim().toLowerCase();
    if (!brandId || EXCLUDED_BRANDS.has(brandId)) continue;
    const channels = configuredChannels((plan.metadata ?? {}) as Record<string, unknown>);
    if (!channels.length) {
      brands.push({ brandId, skipped: true, reason: "no_metrics_channels_configured" });
      continue;
    }

    const brandResult: Record<string, unknown> = { brandId, channels };

    if (channels.includes("instagram")) {
      try {
        const instagram = await resolveBrandInstagramAccessToken(brandId);
        const enrichment = await enrichPublishedGrowthGenomes(supabase as any, {
          brandId,
          channel: "instagram",
          days: Math.max(days, 60),
          timeZone,
        });
        const metrics = await syncGrowthInstagramMetrics(supabase as any, {
          brandId,
          days,
          limit,
          minAgeHours,
          learningMinObservations,
          accessToken: instagram.accessToken,
        });
        brandResult.instagram = {
          success: true,
          channelId: instagram.channelId,
          accountId: instagram.accountId,
          tokenScope: "brand_channel",
          enrichment,
          ...metrics,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Marketing Growth Metrics][${brandId}][Instagram]`, error);
        brandResult.instagram = { success: false, error: message };
      }
    }

    if (channels.includes("facebook")) {
      try {
        const metrics = await syncGrowthFacebookMetrics(supabase as any, {
          brandId,
          days,
          limit,
          minAgeHours,
          learningMinObservations,
          timeZone,
        });
        brandResult.facebook = { success: true, ...metrics };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Marketing Growth Metrics][${brandId}][Facebook]`, error);
        brandResult.facebook = { success: false, error: message };
      }
    }

    brands.push(brandResult);
  }

  return NextResponse.json({
    success: true,
    config: { days, limit, minAgeHours, learningMinObservations, timeZone, excludedBrands: Array.from(EXCLUDED_BRANDS) },
    brands,
  });
}
