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
    const operationalState = result.dryRun && result.awaitingLive > 0
      ? "awaiting_live"
      : result.failed > 0
        ? "partial"
        : "active";

    await supabase
      .from("automation_logs")
      .insert({
        type: "lead_nurture",
        status: result.failed > 0 ? "partial" : "success",
        details: {
          runtime_control: "feature:nurture_live",
          operational_state: operationalState,
          nexus_live: nexusLive,
          dryRun: result.dryRun,
          scanned: result.scanned,
          eligible: result.eligible,
          sent: result.sent,
          failed: result.failed,
          awaiting_live: result.awaitingLive,
          duplicate_dry_runs_suppressed: result.duplicateDryRunsSuppressed,
          dry_run_planned: result.dryRun ? result.planned.filter((item) => !item.alreadyPlanned).length : undefined,
          next_action: result.dryRun && result.awaitingLive > 0
            ? "Enable feature:nurture_live in Nexus Runtime Controls after owner confirmation"
            : undefined,
        },
      })
      .then(() => {})
      .then(undefined, () => {});

    return NextResponse.json({
      success: true,
      nexusLive,
      operationalState,
      nextAction: result.dryRun && result.awaitingLive > 0
        ? "enable_nurture_live"
        : null,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
