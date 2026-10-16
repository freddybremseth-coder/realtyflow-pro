/**
 * Internal-only PostgreSQL adapter for staged Nexus task lifecycle.
 *
 * No pool, credentials, HTTP route, worker or live activation is created here.
 * The caller must supply a trusted server-only query client and derive actor
 * UUIDs from verified sessions. SQL itself checks current brand grants.
 */
import type {
  NexusStoredTask,
  NexusStoredApproval,
  NexusTaskClaimRepository,
  AtomicTaskClaim,
  ClaimStoreOutcome,
} from "./task-execution-claim";

export interface NexusSqlClient {
  query(sql: string, values: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const OP_KEY = /^op_[a-f0-9]{40}$/;
const ALLOWED_ACTION = new Set(["shortlist_draft_prepare", "presentation_draft_prepare", "property_match_prepare"]);
const STATUS = new Set(["draft", "researching", "review_required", "approved", "rejected", "executing", "completed", "failed", "cancelled"]);
function requireUuid(value: string): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error("NEXUS_INVALID_UUID");
  return value;
}
function requireAction(actionType: string, digest: string): void {
  if (!ALLOWED_ACTION.has(actionType) || !DIGEST.test(digest)) throw new Error("NEXUS_ACTION_NOT_ALLOWED");
}
function time(value: unknown): string {
  if (value == null) return "";
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) throw new Error("NEXUS_INVALID_STORED_TIME");
  return parsed.toISOString();
}
function requiredRow(rows: Record<string, unknown>[], field: string): Record<string, unknown> {
  const row = rows[0];
  if (!row || !row[field]) throw new Error("NEXUS_STORAGE_RECEIPT_MISSING");
  return row;
}

export async function createReviewedNexusProposal(client: NexusSqlClient, input: {
  brandId: string;
  proposedBy: string;
  actionType: string;
  actionDigest: string;
  evidenceRefs: string[];
  proposalKey: string;
}): Promise<string> {
  requireUuid(input.brandId);
  requireUuid(input.proposedBy);
  requireAction(input.actionType, input.actionDigest);
  if (!OP_KEY.test(input.proposalKey) || !Array.isArray(input.evidenceRefs)
      || input.evidenceRefs.length < 1 || input.evidenceRefs.some((s) => typeof s !== "string" || !s.trim())) {
    throw new Error("NEXUS_INVALID_PROPOSAL");
  }
  const result = await client.query(
    "select core.create_nexus_review_task($1::uuid,$2::uuid,$3::text,$4::text,$5::text[],$6::text) as task_id",
    [input.brandId, input.proposedBy, input.actionType, input.actionDigest, input.evidenceRefs, input.proposalKey],
  );
  return requireUuid(String(requiredRow(result.rows, "task_id").task_id));
}

export async function decideNexusProposal(client: NexusSqlClient, input: {
  taskId: string;
  reviewedBy: string;
  expectedVersion: number;
  decision: "approved" | "rejected";
  actionDigest: string;
}): Promise<{ decision: string; taskVersion: number; approvalId: string }> {
  requireUuid(input.taskId);
  requireUuid(input.reviewedBy);
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1
      || !["approved", "rejected"].includes(input.decision) || !DIGEST.test(input.actionDigest)) {
    throw new Error("NEXUS_INVALID_REVIEW");
  }
  const result = await client.query(
    "select outcome,task_version,approval_id from core.decide_nexus_review_task($1::uuid,$2::uuid,$3::integer,$4::text,$5::text)",
    [input.taskId, input.reviewedBy, input.expectedVersion, input.decision, input.actionDigest],
  );
  const row = requiredRow(result.rows, "approval_id");
  if (row.outcome !== input.decision || !Number.isSafeInteger(Number(row.task_version))) {
    throw new Error("NEXUS_REVIEW_RECEIPT_INVALID");
  }
  return { decision: String(row.outcome), taskVersion: Number(row.task_version), approvalId: requireUuid(String(row.approval_id)) };
}

/**
 * Post-reservation status check. Does not dispatch or execute the task.
 *
 * The actor must come from verified server auth. SQL performs a fresh
 * transactional check against the approval, grants and claim receipt;
 * if invalid, SQL atomically cancels and audits the reservation.
 */
export async function inspectNexusClaimBeforeDispatch(
  client: NexusSqlClient,
  input: { claimId: string; verifiedActorId: string },
): Promise<{ status: "eligible_now" | "cancelled"; reason: string | null; claimId: string }> {
  requireUuid(input.claimId);
  requireUuid(input.verifiedActorId);
  const result = await client.query(
    "select outcome,reason,claim_id from core.revalidate_nexus_claim_before_dispatch($1::uuid,$2::uuid)",
    [input.claimId,input.verifiedActorId],
  );
  const row = requiredRow(result.rows,"claim_id");
  const claimId = requireUuid(String(row.claim_id));
  if (claimId !== input.claimId || (row.outcome !== "eligible_now" && row.outcome !== "cancelled")) {
    throw new Error("NEXUS_DISPATCH_CHECK_INVALID_RECEIPT");
  }
  if (row.outcome === "eligible_now" && row.reason != null) {
    throw new Error("NEXUS_DISPATCH_CHECK_INVALID_RECEIPT");
  }
  if (row.outcome === "cancelled" && (typeof row.reason !== "string" ||
      !["approval_revoked","approval_expired","executor_scope_denied",
        "reviewer_scope_denied","preflight_stale","task_integrity_changed"].includes(row.reason))) {
    throw new Error("NEXUS_DISPATCH_CHECK_INVALID_RECEIPT");
  }
  return { status: row.outcome, reason: row.reason == null ? null : String(row.reason), claimId };
}

export function makeNexusPostgresClaimRepository(client: NexusSqlClient): NexusTaskClaimRepository {
  return {
    async loadTask(taskId: string): Promise<NexusStoredTask | null> {
      requireUuid(taskId);
      const result = await client.query(
        "select id,brand_id,status,version,action_type,action_digest,proposed_by,quality_reviewed,evidence_refs,preflight_passed,preflight_checked_at from core.nexus_execution_tasks where id=$1::uuid",
        [taskId],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (!STATUS.has(String(row.status)) || !Number.isSafeInteger(Number(row.version))) throw new Error("NEXUS_INVALID_STORED_TASK");
      return {
        id: requireUuid(String(row.id)),
        brandId: requireUuid(String(row.brand_id)),
        status: String(row.status) as NexusStoredTask["status"],
        version: Number(row.version),
        actionType: String(row.action_type),
        actionDigest: String(row.action_digest),
        proposedBy: requireUuid(String(row.proposed_by)),
        qualityReviewed: row.quality_reviewed === true,
        evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs.map(String) : [],
        preflightPassed: row.preflight_passed === true,
        preflightCheckedAt: time(row.preflight_checked_at),
      };
    },
    async loadApproval(taskId: string): Promise<NexusStoredApproval | null> {
      requireUuid(taskId);
      const result = await client.query(
        "select a.id,a.task_id,a.brand_id,a.task_version,a.action_type,a.action_digest,a.decision,a.reviewed_by,a.expires_at from core.nexus_execution_approvals a join core.nexus_execution_tasks t on t.id=a.task_id and t.version=a.task_version where a.task_id=$1::uuid order by a.created_at desc limit 1",
        [taskId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: requireUuid(String(row.id)), taskId: requireUuid(String(row.task_id)),
        brandId: requireUuid(String(row.brand_id)), taskVersion: Number(row.task_version),
        actionType: String(row.action_type), actionDigest: String(row.action_digest),
        decision: row.decision === "approved" ? "approved" : "rejected",
        reviewedBy: requireUuid(String(row.reviewed_by)), expiresAt: time(row.expires_at),
      };
    },
    async claimAtomically(request: AtomicTaskClaim): Promise<ClaimStoreOutcome> {
      requireUuid(request.taskId);
      requireUuid(request.brandId);
      requireUuid(request.approvedBy);
      requireUuid(request.approvalId);
      requireUuid(request.claimedBy);
      requireAction(request.actionType, request.actionDigest);
      if (!Number.isSafeInteger(request.expectedVersion) || request.expectedVersion < 1
          || !OP_KEY.test(request.idempotencyKey)) throw new Error("NEXUS_INVALID_CLAIM");

      try {
        const result = await client.query(
          "select outcome,claim_id from core.claim_nexus_execution_task($1::uuid,$2::integer,$3::uuid,$4::uuid,$5::text,$6::text,$7::text)",
          [request.taskId, request.expectedVersion, request.claimedBy, request.approvalId,
            request.actionType, request.actionDigest, request.idempotencyKey],
        );
        const row = requiredRow(result.rows, "claim_id");
        if (row.outcome !== "claimed" && row.outcome !== "duplicate") throw new Error("NEXUS_CLAIM_RECEIPT_INVALID");
        return { kind: row.outcome, claimId: requireUuid(String(row.claim_id)) };
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "40001") return { kind: "stale" };
        throw error;
      }
    },
  };
}
