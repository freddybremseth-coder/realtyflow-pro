import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runPublishingMarketWatch } from "@/services/automation/publishing-market-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const safeMode = await evaluateCronSafeMode("/api/cron/publishing-market-watch");
  if (safeMode.skip) {
    return NextResponse.json({ success: true, skipped: true, mode: safeMode.mode, reason: safeMode.reason });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    const result = await runPublishingMarketWatch(supabase);
    await supabase.from("automation_logs").insert({
      action: "publishing_market_watch_v1",
      agent_name: "publishing",
      status: "success",
      details: result,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publishing market watch failed";
    await supabase.from("automation_logs").insert({
      action: "publishing_market_watch_v1",
      agent_name: "publishing",
      status: "error",
      details: { error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
