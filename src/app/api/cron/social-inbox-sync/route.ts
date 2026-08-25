export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runReadOnlySocialInboxSync } from "@/services/integrations/nexus-social-inbox-sync";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/social-inbox-sync");
  if (safeMode.skip) return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });

  try {
    return NextResponse.json(await runReadOnlySocialInboxSync({ source: "cron" }));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
