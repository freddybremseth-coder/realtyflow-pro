import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { checkBrandYouTubeHealth } from "@/services/integrations/youtube-health";
import { assessRemasterHealth } from "@/services/growth/remaster-health-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function minutesSince(value: string | null | undefined, nowMs: number) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((nowMs - time) / 60_000));
}

function consecutiveNegativeMeasuredActions(rows: Array<{ learnings?: string | null }>) {
  let negative = 0;
  for (const row of rows) {
    let outcome: string | null = null;
    try {
      const parsed = JSON.parse(row.learnings || "{}");
      outcome = typeof parsed?.feedback?.outcome === "string" ? parsed.feedback.outcome : null;
    } catch {
      outcome = null;
    }
    if (!outcome || outcome === "INSUFFICIENT_DATA") continue;
    if (outcome === "NEGATIVE") {
      negative += 1;
      continue;
    }
    break;
  }
  return negative;
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-health-monitor");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const nowMs = Date.now();
  const since24h = new Date(nowMs - 86_400_000).toISOString();

  try {
    const [planR, channelsR, sourcesR, syncR, growthLoopR, pendingRequestsR, failedRequestsR, failedGrowthR, growthR, youtubeHealth] = await Promise.all([
      supabase.from("marketing_brand_growth_plans").select("status,autonomy_mode,metadata,updated_at").eq("brand_id", "remasterfreddy").maybeSingle(),
      supabase.from("social_channels").select("platform,is_active").eq("brand_id", "remasterfreddy").eq("is_active", true),
      supabase.from("marketing_source_queue").select("status,source_url,payload").eq("brand_id", "remasterfreddy").eq("source_type", "song").limit(1000),
      supabase.from("automation_logs").select("created_at").eq("action", "remaster_source_sync").eq("status", "success").order("created_at", { ascending: false }).limit(1),
      supabase.from("automation_logs").select("created_at,status").eq("action", "remaster_growth_loop").in("status", ["success", "partial"]).order("created_at", { ascending: false }).limit(1),
      supabase.from("marketing_autopilot_run_requests").select("requested_at").eq("status", "pending").contains("brand_ids", ["remasterfreddy"]).order("requested_at", { ascending: true }).limit(1),
      supabase.from("marketing_autopilot_run_requests").select("id", { count: "exact", head: true }).eq("status", "failed").contains("brand_ids", ["remasterfreddy"]).gte("requested_at", since24h),
      supabase.from("growth_actions").select("id", { count: "exact", head: true }).eq("brand", "remasterfreddy").eq("platform", "youtube").eq("status", "failed").gte("created_at", since24h),
      supabase.from("growth_actions").select("learnings,created_at").eq("brand", "remasterfreddy").eq("platform", "youtube").eq("status", "completed").order("created_at", { ascending: false }).limit(30),
      checkBrandYouTubeHealth("remasterfreddy").catch(() => ({ connected: false })),
    ]);

    const queryErrors = [planR.error, channelsR.error, sourcesR.error, syncR.error, growthLoopR.error, pendingRequestsR.error, failedRequestsR.error, failedGrowthR.error, growthR.error].filter(Boolean);
    if (queryErrors.length) throw new Error(queryErrors.map((error: any) => error?.message || "unknown query error").join(" | "));

    const plan: any = planR.data || {};
    const metadata = plan.metadata && typeof plan.metadata === "object" ? plan.metadata : {};
    const configuredChannels = Array.isArray(metadata.autopilot_channels) ? metadata.autopilot_channels.map(String) : [];
    const facebookConnected = (channelsR.data || []).some((row: any) => row.platform === "facebook" && row.is_active);
    const facebookConfigured = facebookConnected && configuredChannels.includes("facebook");

    const sourceDriftCount = (sourcesR.data || []).filter((row: any) => {
      const payloadYoutube = typeof row.payload?.youtube_url === "string" ? row.payload.youtube_url.trim() : "";
      const sourceUrl = typeof row.source_url === "string" ? row.source_url.trim() : "";
      return Boolean(payloadYoutube) && (row.status === "pending" || !sourceUrl);
    }).length;

    const lastSourceSyncAt = syncR.data?.[0]?.created_at || null;
    const lastGrowthLoopAt = growthLoopR.data?.[0]?.created_at || null;
    const pendingRequestedAt = pendingRequestsR.data?.[0]?.requested_at || null;
    const assessment = assessRemasterHealth({
      planActive: plan.status === "active",
      controlledAuto: plan.autonomy_mode === "controlled_auto",
      planUpdatedAt: plan.updated_at || null,
      facebookConfigured,
      youtubeConnected: Boolean((youtubeHealth as any)?.connected),
      sourceSyncLastSuccessAt: lastSourceSyncAt,
      sourceSyncFreshnessMinutes: 90,
      growthLoopLastRunAt: lastGrowthLoopAt,
      growthLoopFreshnessMinutes: 26 * 60,
      sourceDriftCount,
      pendingPromotionRequestAgeMinutes: minutesSince(pendingRequestedAt, nowMs),
      failedPromotionRequests24h: failedRequestsR.count || 0,
      failedGrowthActions24h: failedGrowthR.count || 0,
      consecutiveNegativeMeasuredActions: consecutiveNegativeMeasuredActions((growthR.data || []) as Array<{ learnings?: string | null }>),
    }, nowMs);

    await supabase.from("automation_logs").insert({
      action: "remaster_health_monitor",
      agent_name: "nexus_remaster_health_monitor",
      status: assessment.state === "healthy" ? "success" : assessment.state,
      details: {
        reasons: assessment.reasons,
        plan_active: assessment.planActive,
        controlled_auto: assessment.controlledAuto,
        facebook_configured: assessment.facebookConfigured,
        youtube_connected: assessment.youtubeConnected,
        source_sync_last_success_at: assessment.sourceSyncLastSuccessAt,
        growth_loop_last_run_at: assessment.growthLoopLastRunAt,
        source_drift_count: assessment.sourceDriftCount,
        pending_promotion_request_age_minutes: assessment.pendingPromotionRequestAgeMinutes,
        failed_promotion_requests_24h: assessment.failedPromotionRequests24h,
        failed_growth_actions_24h: assessment.failedGrowthActions24h,
        consecutive_negative_measured_actions: assessment.consecutiveNegativeMeasuredActions,
      },
    });

    return NextResponse.json({ success: true, generatedAt: new Date(nowMs).toISOString(), health: assessment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Re-Master health monitor failed";
    await supabase.from("automation_logs").insert({
      action: "remaster_health_monitor",
      agent_name: "nexus_remaster_health_monitor",
      status: "error",
      details: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
