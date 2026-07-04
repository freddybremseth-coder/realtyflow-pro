import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
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
  const liveEnv = String(process.env.NURTURE_LIVE || "").toLowerCase() === "true";
  const liveQuery = searchParams.get("live") === "1";
  const forceDry = searchParams.get("dry") === "1";
  const dryRun = forceDry || !(liveEnv || liveQuery);

  const brandId = searchParams.get("brand") || undefined;
  const limit = Number(searchParams.get("limit") || 50) || 50;
  const email = searchParams.get("email") || undefined;

  try {
    const result = await runNurtureCycle(supabase, { dryRun, brandId, limit, email });

    await supabase
      .from("automation_logs")
      .insert({
        type: "lead_nurture",
        status: result.failed > 0 ? "partial" : "success",
        details: {
          dryRun: result.dryRun,
          scanned: result.scanned,
          eligible: result.eligible,
          sent: result.sent,
          failed: result.failed,
          dry_run_planned: result.dryRun ? result.planned.length : undefined,
        },
      })
      .then(() => {})
      .then(undefined, () => {});

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 },
    );
  }
}
