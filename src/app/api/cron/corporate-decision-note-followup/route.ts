import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireCronApi } from "@/lib/api-cron";
import { evaluateCronSafeMode } from "@/lib/cron/safe-mode";
import { runCorporateDecisionNoteFollowups } from "@/services/corporate/decision-note-followup";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PATH = "/api/cron/corporate-decision-note-followup";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest) {
  const denied = requireCronApi(request);
  if (denied) return denied;

  const safeMode = await evaluateCronSafeMode(PATH);
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
    const limit = Number(request.nextUrl.searchParams.get("limit") || 150) || 150;
    const result = await runCorporateDecisionNoteFollowups(supabase, { limit });

    await supabase.from("automation_logs").insert({
      action: "corporate_decision_note_followup",
      agent_name: "corporate_decision_note_followup_cron",
      status: result.failed > 0 ? "error" : "success",
      details: {
        path: PATH,
        scanned: result.scanned,
        eligible: result.eligible,
        sent: result.sent,
        stopped: result.stopped,
        skipped: result.skipped,
        failed: result.failed,
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Corporate decision note follow-up failed";
    await supabase.from("automation_logs").insert({
      action: "corporate_decision_note_followup",
      agent_name: "corporate_decision_note_followup_cron",
      status: "error",
      details: { path: PATH, error: message },
    }).then(() => null);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = GET;
