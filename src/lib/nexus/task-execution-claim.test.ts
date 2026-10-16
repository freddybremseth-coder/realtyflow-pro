import assert from "node:assert/strict";
import test from "node:test";
import {
  claimApprovedNexusTask, NexusTaskClaimDenied,
  type NexusStoredTask, type NexusStoredApproval,
  type NexusTaskClaimRepository, type AtomicTaskClaim, type ClaimStoreOutcome,
} from "./task-execution-claim";

const now = "2026-10-15T19:00:00.000Z";
const digest = "sha256:" + "a".repeat(64);
const task: NexusStoredTask = {
  id: "task-abc", brandId: "altovena", status: "approved", version: 3,
  actionType: "shortlist_draft_prepare", actionDigest: digest,
  proposedBy: "agent-1", qualityReviewed: true, evidenceRefs: ["source-1"],
  preflightPassed: true, preflightCheckedAt: now,
};
const approval: NexusStoredApproval = {
  id: "approval-1", taskId: task.id, brandId: task.brandId,
  taskVersion: task.version, actionType: task.actionType, actionDigest: task.actionDigest,
  decision: "approved", reviewedBy: "reviewer-1", expiresAt: "2026-10-15T19:05:00.000Z",
};
const principal = { id: "executor-1", brandIds: ["altovena"], canExecuteNexusTasks: true };

function fixture(override: { task?: Partial<NexusStoredTask>; approval?: Partial<NexusStoredApproval> } = {}) {
  let activeTask = { ...task, ...override.task };
  let activeApproval = { ...approval, ...override.approval };
  const seen = new Map<string, string>();
  let claims = 0;
  let auditEvents = 0;
  const repository: NexusTaskClaimRepository = {
    async loadTask() { return { ...activeTask }; },
    async loadApproval() { return { ...activeApproval }; },
    async claimAtomically(request: AtomicTaskClaim): Promise<ClaimStoreOutcome> {
      if (activeTask.status !== "approved" || activeTask.version !== request.expectedVersion ||
          activeTask.actionDigest !== request.actionDigest || activeApproval.id !== request.approvalId) {
        return { kind: "stale" };
      }
      const existing = seen.get(request.idempotencyKey);
      if (existing) return { kind: "duplicate", claimId: existing };
      claims++;
      auditEvents++; // Fake atomic transaction; real adapter must do both in DB.
      const claimId = "claim-" + String(claims);
      seen.set(request.idempotencyKey, claimId);
      activeTask = { ...activeTask, status: "executing", version: activeTask.version + 1 };
      return { kind: "claimed", claimId };
    },
  };
  const invoke = (extra: Record<string, unknown> = {}) =>
    claimApprovedNexusTask({ repository, principal, taskId: task.id, now,
      executionRuntimeEnabled: true, auditTrailReady: true, ...extra });
  return {
    invoke, get claims() { return claims; }, get events() { return auditEvents; },
    alterTask(update: Partial<NexusStoredTask>) { activeTask = { ...activeTask, ...update }; },
  };
}
async function denies(reason: string, overrides: Parameters<typeof fixture>[0] = {}, input: Record<string, unknown> = {}) {
  const f = fixture(overrides);
  await assert.rejects(f.invoke(input), (e: unknown) =>
    e instanceof NexusTaskClaimDenied && e.reason === reason);
  assert.equal(f.claims, 0);
  assert.equal(f.events, 0);
}
test("approved, evidence-backed task produces one atomic claim receipt", async () => {
  const f = fixture();
  const receipt = await f.invoke();
  assert.equal(receipt.kind, "claimed");
  assert.equal(f.claims, 1);
  assert.equal(f.events, 1);
  assert.match(receipt.kind === "claimed" ? receipt.idempotencyKey : "", /^op_[a-f0-9]{40}$/);
});
test("runtime, audit, authentication and brand isolation are fail closed", async () => {
  await denies("runtime_disabled", {}, { executionRuntimeEnabled: false });
  await denies("audit_unavailable", {}, { auditTrailReady: false });
  await denies("execution_permission_missing", {}, { principal: { ...principal, canExecuteNexusTasks: false } });
  await denies("brand_scope_denied", {}, { principal: { ...principal, brandIds: ["zeneco"] } });
});
test("independent, current, untampered, unexpired approval is mandatory", async () => {
  await denies("task_not_approved", { task: { status: "draft" } });
  await denies("evidence_not_verified", { task: { evidenceRefs: [] } });
  await denies("evidence_not_verified", { task: { qualityReviewed: false } });
  await denies("approval_mismatch", { approval: { taskVersion: 2 } });
  await denies("approval_mismatch", { approval: { actionDigest: "sha256:" + "b".repeat(64) } });
  await denies("approval_mismatch", { approval: { actionType: "crm_note_update" } });
  await denies("independent_review_required", { approval: { reviewedBy: "agent-1" } });
  await denies("independent_review_required", { approval: { reviewedBy: "executor-1" } });
  await denies("approval_expired", { approval: { expiresAt: now } });
});
test("existing Nexus action policy blocks forbidden and unknown actions", async () => {
  await denies("execution_boundary:unknown_action", {
    task: { actionType: "invented-action" }, approval: { actionType: "invented-action" },
  });
  await denies("execution_boundary:policy_class:forbidden", {
    task: { actionType: "legal_or_contract_commitment" },
    approval: { actionType: "legal_or_contract_commitment" },
  });
  await denies("execution_boundary:policy_class:human_required", {
    task: { actionType: "viewing_booking" }, approval: { actionType: "viewing_booking" },
  });
});
test("preflight must remain fresh even when other flags are true", async () => {
  await denies("execution_boundary:fresh_safety_check_required", {
    task: { actionType: "social_publish_approved", preflightCheckedAt: "2026-10-15T18:40:00.000Z" },
    approval: { actionType: "social_publish_approved" },
  });
});
test("the adapter must reserve exactly one claim under concurrency", async () => {
  const f = fixture();
  const [first, second] = await Promise.all([f.invoke(), f.invoke()]);
  assert.equal(first.kind, "claimed");
  assert.equal(second.kind, "stale");
  assert.equal(f.claims, 1);
  assert.equal(f.events, 1);
});
test("replay after an already claimed task cannot start a second execution", async () => {
  const f = fixture();
  assert.equal((await f.invoke()).kind, "claimed");
  await assert.rejects(f.invoke(), (e: unknown) =>
    e instanceof NexusTaskClaimDenied && e.reason === "task_not_approved");
  assert.equal(f.claims, 1);
  assert.equal(f.events, 1);
});
