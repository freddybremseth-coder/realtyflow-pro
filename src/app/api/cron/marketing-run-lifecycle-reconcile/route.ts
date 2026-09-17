import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { reconcileSuccessfulMarketingRuns } from "@/services/marketing/run-lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/marketing-run-lifecycle-reconcile");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const startedAt = new Date().toISOString();
  try {
    const result = await reconcileSuccessfulMarketingRuns(supabase as any, { limit: 2000 });
    const status = result.errors.length ? "partial" : "success";

    await supabase.from("automation_logs").insert({
      action: "marketing_run_lifecycle_reconcile",
      agent_name: "marketing-growth-os",
      status,
      details: {
        ...result,
        runtime_control: "cron:/api/cron/marketing-run-lifecycle-reconcile",
        safety_rule: "Only running marketing-growth-os runs whose every publication is published/scheduled are closed.",
      },
    }).then(() => undefined, () => undefined);

    return NextResponse.json({ success: result.errors.length === 0, status, startedAt, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("automation_logs").insert({
      action: "marketing_run_lifecycle_reconcile",
      agent_name: "marketing-growth-os",
      status: "error",
      details: { error: message, runtime_control: "cron:/api/cron/marketing-run-lifecycle-reconcile" },
    }).then(() => undefined, () => undefined);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
