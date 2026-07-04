import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runPublishingAutopilot } from "@/services/automation/publishing-autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode("/api/cron/publishing-autopilot");
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
    });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const result = await runPublishingAutopilot(supabase, { limit: 8 });
    await supabase.from("automation_logs").insert({
      action: "publishing_autopilot_v1",
      agent_name: "publishing",
      status: "success",
      details: result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing autopilot failed";
    await supabase.from("automation_logs").insert({
      action: "publishing_autopilot_v1",
      agent_name: "publishing",
      status: "error",
      details: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
