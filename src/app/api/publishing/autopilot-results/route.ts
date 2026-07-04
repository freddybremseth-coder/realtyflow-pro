import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { runs: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ runs: [], error: "Supabase not configured" }, { status: 503 });

  const [logsRes, runsRes] = await Promise.all([
    supabase
      .from("automation_logs")
      .select("id,action,status,details,created_at")
      .eq("action", "publishing_autopilot_v1")
      .order("created_at", { ascending: false })
      .limit(15),
    supabase
      .from("automation_runs")
      .select("id,status,input,output,error,started_at,finished_at")
      .order("started_at", { ascending: false })
      .limit(40),
  ]);

  const data = logsRes.data || [];
  const error = logsRes.error;
  if (error) {
    if (/automation_logs|schema cache|does not exist|relation/i.test(error.message)) {
      // Continue with runs fallback only.
    } else {
      return NextResponse.json({ runs: [], error: error.message }, { status: 500 });
    }
  }

  const logRuns = (data || []).map((row) => {
    const details = (row.details || {}) as Record<string, any>;
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      processed: Number(details.processed || 0),
      moved_to_review: Number(details.moved_to_review || 0),
      suggestions_created: Number(details.suggestions_created || 0),
      created_draft_ids: Array.isArray(details.created_draft_ids) ? details.created_draft_ids : [],
      items: Array.isArray(details.items) ? details.items : [],
      error: details.error || null,
    };
  });

  const runRows = runsRes.data || [];
  const runFallback = runRows
    .filter((row) => {
      const inputName = String((row.input as any)?.name || "");
      const output = (row.output as any) || {};
      const outputs = Array.isArray(output.outputs) ? output.outputs : [];
      return /publishing autopilot v1/i.test(inputName) || outputs.some((item: any) => item?.step?.type === "process_kdp_work_items");
    })
    .map((row) => {
      const output = (row.output as any) || {};
      const outputs = Array.isArray(output.outputs) ? output.outputs : [];
      const autopilotResult = outputs.find((item: any) => item?.step?.type === "process_kdp_work_items")?.result || {};
      return {
        id: row.id,
        status: row.status === "error" ? "error" : "success",
        created_at: row.finished_at || row.started_at || new Date().toISOString(),
        processed: Number(autopilotResult.processed || 0),
        moved_to_review: Number(autopilotResult.moved_to_review || 0),
        suggestions_created: Number(autopilotResult.suggestions_created || 0),
        created_draft_ids: Array.isArray(autopilotResult.created_draft_ids) ? autopilotResult.created_draft_ids : [],
        items: Array.isArray(autopilotResult.items) ? autopilotResult.items : [],
        error: row.error || null,
      };
    });

  const merged = [...logRuns, ...runFallback]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 15);

  return NextResponse.json({ runs: merged });
}
