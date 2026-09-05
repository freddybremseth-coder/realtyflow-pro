import { NextRequest, NextResponse } from "next/server";
import { requireNexusSchedulerApi } from "@/lib/nexus/scheduler-auth";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { getServiceSupabase } from "@/services/marketing/campaign-production";
import { reconcileRemasterSongSources } from "@/services/growth/remaster-source-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const unauthorized = await requireNexusSchedulerApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/remaster-source-sync");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const reconciliation = await reconcileRemasterSongSources(supabase);
    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      reconciliation,
      workflow: "Re-Master Admin -> songs -> marketing_source_queue -> Nexus Growth OS",
      note: "This route only reconciles canonical song/source state. It does not upload or publish songs.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Re-Master source reconciliation failed" },
      { status: 500 },
    );
  }
}
