import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { isNurtureLiveEnabled } from "@/lib/nexus/runtime-controls";
import { runNurtureCycle } from "@/services/growth/nurture-engine";

export const LEAD_NURTURE_CRON_PATH = "/api/cron/lead-nurture";

function getNurtureSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function runLeadNurtureRequest(request: NextRequest) {
  const safeMode = await evaluateCronSafeMode(LEAD_NURTURE_CRON_PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  const supabase = getNurtureSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const searchParams = request.nextUrl.searchParams;
  const nexusLive = await isNurtureLiveEnabled();
  // Manual test calls may always force dry-run. They may no longer bypass a
  // disabled Nexus LIVE switch with ?live=1; operational enablement belongs
  // in Nexus, not in a URL or Vercel setting.
  const forceDry = searchParams.get("dry") === "1";
  const dryRun = forceDry || !nexusLive;

  const brandId = searchParams.get("brand") || undefined;
  const limit = Number(searchParams.get("limit") || 50) || 50;
  const email = searchParams.get("email") || undefined;

  try {
    const result = await runNurtureCycle(supabase, { dryRun, brandId, limit, email });

    const { error: logError } = await supabase
      .from("automation_logs")
      .insert({
        action: "lead_nurture",
        agent_name: "lead_nurture_cron",
        status: result.failed > 0 ? "partial" : "success",
        details: {
          runtime_control: "feature:nurture_live",
          nexus_live: nexusLive,
          dry_run: result.dryRun,
          scanned: result.scanned,
          eligible: result.eligible,
          sent: result.sent,
          failed: result.failed,
          skipped: result.skipped,
          flagged_spam: result.flaggedSpam,
          awaiting_live: result.awaitingLive,
          duplicate_dry_runs_suppressed: result.duplicateDryRunsSuppressed,
          sendability_blocked: result.sendabilityBlocked,
          sendability_review: result.sendabilityReview,
          sendability_reasons: result.sendabilityReasons,
          dry_run_planned: result.dryRun ? result.planned.length : undefined,
        },
      });

    if (logError) {
      console.warn("[lead-nurture] automation log insert failed", logError.message);
    }

    return NextResponse.json({ success: true, nexusLive, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal error";
    await supabase
      .from("automation_logs")
      .insert({
        action: "lead_nurture",
        agent_name: "lead_nurture_cron",
        status: "failed",
        details: { error: message, runtime_control: "feature:nurture_live", nexus_live: nexusLive },
      })
      .then(() => {})
      .then(undefined, () => {});

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
