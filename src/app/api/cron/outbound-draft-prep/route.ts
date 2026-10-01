export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import {
  OUTBOUND_AUTO_DRAFT_PATH,
  runOutboundAutoDraftPrep,
} from "@/lib/outbound-engagement/auto-draft-runner";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronApi(request);
  if (unauthorized) return unauthorized;

  const safeMode = await evaluateCronSafeMode(OUTBOUND_AUTO_DRAFT_PATH);
  if (safeMode.skip) {
    return NextResponse.json({
      success: true,
      skipped: true,
      mode: safeMode.mode,
      reason: safeMode.reason,
      send_executed: false,
      external_action_executed: false,
    });
  }

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  try {
    return NextResponse.json(await runOutboundAutoDraftPrep(supabase, { trigger: "cron" }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Outbound auto-draft preparation failed" },
      { status: 500 },
    );
  }
}
