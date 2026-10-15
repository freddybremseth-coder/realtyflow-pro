/**
 * Nexus Task Execution — server-side admission boundary (phase 1).
 *
 * NOT a worker or database adapter. The ONLY successful outcome is an atomic
 * execution claim; no CRM, email, publishing or finance action is performed here.
 * All arguments must come from trusted server-side sessions and database reads.
 */
import { operationIdempotencyKey } from "@/lib/agentic/ids";
import { evaluateNexusExecutionBoundary } from "@/lib/nexus/execution-boundary";

export type TaskExecutionStatus =
  | "draft" | "researching" | "review_required" | "approved"
  | "rejected" | "executing" | "completed" | "failed" | "cancelled";

export type NexusStoredTask = Readonly<{
  id: string;
  brandId: string;
  status: TaskExecutionStatus;
  version: number;
  actionType: string;
  actionDigest: string;
  proposedBy: string;
  qualityReviewed: boolean;
  evidenceRefs: readonly string[];
  preflightPassed: boolean;
  preflightCheckedAt: string;
}>;

export type NexusStoredApproval = Readonly<{
  id: string;
  taskId: string;
  brandId: string;
  taskVersion: number;
  actionType: string;
  actionDigest: string;
  decision: "approved" | "rejected";
  reviewedBy: string;
  expiresAt: string;
}>;

// Identity must be resolved by trusted server auth and current brand memberships,
// NEVER from client-supplied roles, JWT user_metadata, or request body.
export type VerifiedExecutionPrincipal = Readonly<{
  id: string;
  brandIds: readonly string[];
  canExecuteNexusTasks: boolean;
}>;

export type AtomicTaskClaim = Readonly<{
  taskId: string;
  brandId: string;
  expectedVersion: number;
  approvedBy: string;
  approvalId: string;
  actionType: string;
  actionDigest: string;
  claimedBy: string;
  idempotencyKey: string;
  claimedAt: string;
}>;

export type ClaimStoreOutcome =
  | { kind: "claimed"; claimId: string }
  | { kind: "duplicate"; claimId: string }
  | { kind: "stale" };

export interface NexusTaskClaimRepository {
  // Reads MUST be server-side from the authoritative store.
  loadTask(taskId: string): Promise<NexusStoredTask | null>;
  loadApproval(taskId: string): Promise<NexusStoredApproval | null>;
  // DB implementation MUST perform a single transaction, checking version/status,
  // approval revocation/expiry, brand membership, unique idempotency key, then
  // atomically reserving the claim and appending an immutable audit event.
  // Returning "claimed" without a durable committed claim and event is forbidden.
  claimAtomically(request: AtomicTaskClaim): Promise<ClaimStoreOutcome>;
}

export type NexusTaskClaimResult =
  | { kind: "claimed" | "duplicate"; claimId: string; idempotencyKey: string }
  | { kind: "stale" };

export class NexusTaskClaimDenied extends Error {
  constructor(readonly reason: string) {
    super("NEXUS_TASK_CLAIM_DENIED:" + reason);
    this.name = "NexusTaskClaimDenied";
  }
}

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const reject = (reason: string): never => { throw new NexusTaskClaimDenied(reason); };
const parseTime = (value: string): number => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : NaN;
};

/**
 * Review and reserve execution. This function does NOT run an action.
 * It cannot become a public API without a secure auth adapter and database
 * transaction implementation; the in-memory test adapter is NOT production.
 */
export async function claimApprovedNexusTask(input: {
  repository: NexusTaskClaimRepository;
  principal: VerifiedExecutionPrincipal;
  taskId: string;
  now: string;
  executionRuntimeEnabled: boolean;
  auditTrailReady: boolean;
}): Promise<NexusTaskClaimResult> {
  const { repository, principal } = input;
  const now = parseTime(input.now);
  if (!Number.isFinite(now)) return reject("invalid_clock");
  if (!input.executionRuntimeEnabled) return reject("runtime_disabled");
  if (!input.auditTrailReady) return reject("audit_unavailable");
  if (!principal?.id || !principal.canExecuteNexusTasks) return reject("execution_permission_missing");
  if (!IDENTIFIER.test(input.taskId)) return reject("invalid_task_id");

  const task = await repository.loadTask(input.taskId);
  if (!task || task.id !== input.taskId || !IDENTIFIER.test(task.brandId)) return reject("task_not_found");
  if (!principal.brandIds.includes(task.brandId)) return reject("brand_scope_denied");
  if (task.status !== "approved" || !Number.isSafeInteger(task.version) || task.version < 1) return reject("task_not_approved");
  if (!IDENTIFIER.test(task.proposedBy) || !DIGEST.test(task.actionDigest)) return reject("invalid_task_integrity");
  if (!task.qualityReviewed || !Array.isArray(task.evidenceRefs) || task.evidenceRefs.length === 0 ||
      task.evidenceRefs.some((ref) => typeof ref !== "string" || !ref.trim())) return reject("evidence_not_verified");

  const approval = await repository.loadApproval(task.id);
  if (!approval || approval.taskId !== task.id || approval.brandId !== task.brandId ||
      approval.taskVersion !== task.version || approval.actionDigest !== task.actionDigest ||
      approval.actionType !== task.actionType || approval.decision !== "approved" ||
      !IDENTIFIER.test(approval.id) || !IDENTIFIER.test(approval.reviewedBy)) return reject("approval_mismatch");
  if (approval.reviewedBy === task.proposedBy || approval.reviewedBy === principal.id) return reject("independent_review_required");
  const expiresAt = parseTime(approval.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return reject("approval_expired");

  const idempotencyKey = operationIdempotencyKey(task.id, "nexus_task_claim", String(task.version) + ":" + task.actionDigest);
  const boundary = evaluateNexusExecutionBoundary(task.actionType, {
    executorEnabled: input.executionRuntimeEnabled,
    evidenceSatisfied: true,
    auditTrailReady: input.auditTrailReady,
    idempotencyKey,
    explicitApprovalSatisfied: true,
    freshPreflight: { passed: task.preflightPassed, checkedAt: task.preflightCheckedAt },
    now: input.now,
  });
  if (!boundary.automaticExecutionAllowed) return reject("execution_boundary:" + boundary.blockers.join(","));

  const claim = await repository.claimAtomically({
    taskId: task.id, brandId: task.brandId, expectedVersion: task.version,
    approvedBy: approval.reviewedBy, approvalId: approval.id,
    actionType: task.actionType, actionDigest: task.actionDigest,
    claimedBy: principal.id, idempotencyKey, claimedAt: input.now,
  });
  if (claim.kind === "stale") return { kind: "stale" };
  if (!claim.claimId || !IDENTIFIER.test(claim.claimId)) return reject("invalid_claim_receipt");
  return { kind: claim.kind, claimId: claim.claimId, idempotencyKey };
}
