import type { RunOutcome, RunStatus } from "@/lib/agentic/schemas";

export interface NexusMissionRunRow {
  id: string;
  agent_id: string;
  status: RunStatus | string;
  outcome?: RunOutcome | string | null;
  steps?: unknown;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at?: string | null;
}

export interface NexusMissionApprovalRow {
  id: string;
  run_id?: string | null;
  subject_ref?: string | null;
  status?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  executed_at?: string | null;
}

export type NexusMissionOperationalState =
  | "pending"
  | "awaiting_preparation"
  | "waiting_approval"
  | "approved"
  | "executed"
  | "recommended"
  | "rejected"
  | "failed"
  | "cancelled";

export interface NexusMissionStateProjection {
  missionId: string;
  runId: string;
  agentId: string;
  runStatus: string;
  outcome: string | null;
  operationalState: NexusMissionOperationalState;
  transition: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string | null;
}

function traceSteps(row: NexusMissionRunRow): Array<Record<string, unknown>> {
  return Array.isArray(row.steps) ? row.steps.filter((step): step is Record<string, unknown> => Boolean(step && typeof step === "object")) : [];
}

function traceData(step: Record<string, unknown>) {
  return step.data && typeof step.data === "object" ? step.data as Record<string, unknown> : null;
}

export function missionIdFromRun(row: NexusMissionRunRow) {
  for (const step of traceSteps(row)) {
    const data = traceData(step);
    const missionId = data?.mission_id;
    if (typeof missionId === "string" && missionId.trim()) return missionId.trim();
  }
  return null;
}

export function latestMissionTransition(row: NexusMissionRunRow) {
  const steps = traceSteps(row);
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const transition = traceData(steps[i])?.transition;
    if (typeof transition === "string" && transition.trim()) return transition.trim();
  }
  return null;
}

function operationalState(
  run: NexusMissionRunRow,
  transition: string | null,
  approval: NexusMissionApprovalRow | undefined,
): NexusMissionOperationalState {
  const approvalStatus = String(approval?.status || "").toLowerCase();
  const outcome = String(run.outcome || "").toLowerCase();
  const status = String(run.status || "").toLowerCase();

  if (approvalStatus === "executed" || outcome === "executed") return "executed";
  if (approvalStatus === "approved" || outcome === "approved") return "approved";
  if (approvalStatus === "rejected" || outcome === "rejected") return "rejected";
  if (status === "failed" || outcome === "failed") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "completed" && outcome === "recommended") return "recommended";
  if (status === "waiting_approval" || approvalStatus === "pending") return "waiting_approval";
  if (transition === "await_preparer") return "awaiting_preparation";
  return "pending";
}

function ts(row: NexusMissionRunRow) {
  const value = row.updated_at || row.finished_at || row.started_at || "";
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildNexusMissionStateProjection(
  runs: NexusMissionRunRow[],
  approvals: NexusMissionApprovalRow[] = [],
) {
  const approvalByRun = new Map<string, NexusMissionApprovalRow>();
  for (const approval of approvals) {
    if (!approval.run_id) continue;
    const existing = approvalByRun.get(approval.run_id);
    const existingTs = existing ? new Date(existing.executed_at || existing.resolved_at || existing.created_at || "").getTime() : 0;
    const currentTs = new Date(approval.executed_at || approval.resolved_at || approval.created_at || "").getTime();
    if (!existing || (Number.isFinite(currentTs) ? currentTs : 0) >= (Number.isFinite(existingTs) ? existingTs : 0)) {
      approvalByRun.set(approval.run_id, approval);
    }
  }

  const latestByMission = new Map<string, NexusMissionRunRow>();
  for (const run of runs) {
    const missionId = missionIdFromRun(run);
    if (!missionId) continue;
    const existing = latestByMission.get(missionId);
    if (!existing || ts(run) >= ts(existing)) latestByMission.set(missionId, run);
  }

  return [...latestByMission.entries()]
    .map(([missionId, run]): NexusMissionStateProjection => {
      const transition = latestMissionTransition(run);
      const approval = approvalByRun.get(run.id);
      return {
        missionId,
        runId: run.id,
        agentId: run.agent_id,
        runStatus: String(run.status || "pending"),
        outcome: run.outcome ? String(run.outcome) : null,
        operationalState: operationalState(run, transition, approval),
        transition,
        approvalId: approval?.id ? String(approval.id) : null,
        approvalStatus: approval?.status ? String(approval.status) : null,
        startedAt: run.started_at || null,
        finishedAt: run.finished_at || null,
        updatedAt: run.updated_at || run.finished_at || run.started_at || null,
      };
    })
    .sort((a, b) => new Date(b.updatedAt || "").getTime() - new Date(a.updatedAt || "").getTime());
}
