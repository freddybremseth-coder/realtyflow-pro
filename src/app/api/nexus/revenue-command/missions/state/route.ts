import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildNexusMissionStateProjection,
  type NexusMissionApprovalRow,
  type NexusMissionRunRow,
} from "@/lib/nexus-mission-state";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: runData, error: runError } = await supabase
    .from("agent_runs")
    .select("id,agent_id,status,outcome,steps,started_at,finished_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const runs = ((runData || []) as NexusMissionRunRow[]).filter((row) => String(row.agent_id || "").startsWith("nexus_"));
  const runIds = runs.map((row) => row.id);

  let approvals: NexusMissionApprovalRow[] = [];
  if (runIds.length) {
    const { data: approvalData, error: approvalError } = await supabase
      .from("agentic_approvals")
      .select("id,run_id,subject_ref,status,created_at,resolved_at,executed_at")
      .in("run_id", runIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 500 });
    approvals = (approvalData || []) as NexusMissionApprovalRow[];
  }

  const states = buildNexusMissionStateProjection(runs, approvals);
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    states,
    summary: states.reduce<Record<string, number>>((acc, row) => {
      acc[row.operationalState] = (acc[row.operationalState] || 0) + 1;
      return acc;
    }, {}),
    safety: { readOnly: true, source: "agent_runs+agentic_approvals" },
  });
}
