export interface NexusApprovalOutcomeRow {
  run_id?: string | null;
  status?: string | null;
  resolved_at?: string | null;
  executed_at?: string | null;
}

export interface NexusRunOutcomeRow {
  id: string;
  agent_id?: string | null;
  status?: string | null;
  outcome?: string | null;
}

export interface NexusRunOutcomePatch {
  status?: "waiting_approval" | "completed";
  outcome?: "approved" | "executed" | "rejected";
  finished_at?: string | null;
}

export function nexusRunOutcomePatch(
  approval: NexusApprovalOutcomeRow,
  run: NexusRunOutcomeRow,
): NexusRunOutcomePatch | null {
  if (!String(run.agent_id || "").startsWith("nexus_")) return null;
  const status = String(approval.status || "").toLowerCase();

  if (status === "executed") {
    return {
      status: "completed",
      outcome: "executed",
      finished_at: approval.executed_at || approval.resolved_at || new Date().toISOString(),
    };
  }
  if (status === "rejected") {
    return {
      status: "completed",
      outcome: "rejected",
      finished_at: approval.resolved_at || new Date().toISOString(),
    };
  }
  if (status === "approved") {
    return {
      status: "waiting_approval",
      outcome: "approved",
      finished_at: null,
    };
  }
  return null;
}

export async function reconcileNexusMissionRunFromApproval(
  supabase: { from(table: string): any },
  approvalId: string,
) {
  const { data: approval, error: approvalError } = await supabase
    .from("agentic_approvals")
    .select("run_id,status,resolved_at,executed_at")
    .eq("id", approvalId)
    .maybeSingle();
  if (approvalError) return { ok: false, error: approvalError.message };
  if (!approval?.run_id) return { ok: true, updated: false, reason: "no_run" };

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .select("id,agent_id,status,outcome")
    .eq("id", approval.run_id)
    .maybeSingle();
  if (runError) return { ok: false, error: runError.message };
  if (!run) return { ok: true, updated: false, reason: "run_not_found" };

  const patch = nexusRunOutcomePatch(approval, run);
  if (!patch) return { ok: true, updated: false, reason: "not_nexus_or_no_terminal_state" };

  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", run.id);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, updated: true, runId: run.id, patch };
}
