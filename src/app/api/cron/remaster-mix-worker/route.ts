import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { remasterMixProduction } from "@/workflows/remaster-mix-production";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  try {
    const workflowRun = await start(remasterMixProduction, [{ trigger: "cron", requestedJobId: null }]);
    return NextResponse.json({
      success: true,
      started: true,
      workflowRunId: workflowRun.runId,
      purpose: "Re-Master Mediterranean Mix queue recovery",
    }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start Re-Master mix workflow" },
      { status: 500 },
    );
  }
}
