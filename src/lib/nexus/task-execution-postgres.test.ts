import assert from "node:assert/strict";
import test from "node:test";
import {
  createReviewedNexusProposal,
  inspectNexusClaimBeforeDispatch,
  decideNexusProposal,
  makeNexusPostgresClaimRepository,
  type NexusSqlClient,
} from "./task-execution-postgres";

const ids = {
  task: "66666666-6666-4666-8666-666666666666",
  brand: "11111111-1111-4111-8111-111111111111",
  author: "22222222-2222-4222-8222-222222222222",
  reviewer: "33333333-3333-4333-8333-333333333333",
  executor: "44444444-4444-4444-8444-444444444444",
  approval: "77777777-7777-4777-8777-777777777777",
  claim: "88888888-8888-4888-8888-888888888888",
};
const digest = "sha256:" + "a".repeat(64);
const opKey = "op_" + "b".repeat(40);
type Call = { sql: string; values: readonly unknown[] };
function spy(responses: Record<string, unknown>[][] = []) {
  const calls: Call[] = [];
  const db: NexusSqlClient = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: responses.shift() ?? [] };
    },
  };
  return { db, calls };
}

test("proposal uses parameterized private RPC and validates receipt", async () => {
  const s = spy([[{ task_id: ids.task }]]);
  const taskId = await createReviewedNexusProposal(s.db, {
    brandId: ids.brand, proposedBy: ids.author, actionType: "shortlist_draft_prepare",
    actionDigest: digest, evidenceRefs: ["source:1"], proposalKey: opKey,
  });
  assert.equal(taskId, ids.task);
  assert.match(s.calls[0].sql, /core\.create_nexus_review_task\(\$1::uuid/);
  assert.deepEqual(s.calls[0].values, [ids.brand, ids.author, "shortlist_draft_prepare", digest, ["source:1"], opKey]);
  assert.ok(!s.calls[0].sql.includes(ids.brand));
});

test("malformed proposal is rejected without database call", async () => {
  const s = spy();
  await assert.rejects(createReviewedNexusProposal(s.db, {
    brandId: ids.brand, proposedBy: ids.author, actionType: "send_email",
    actionDigest: digest, evidenceRefs: ["source:1"], proposalKey: opKey,
  }), /NEXUS_ACTION_NOT_ALLOWED/);
  await assert.rejects(createReviewedNexusProposal(s.db, {
    brandId: ids.brand, proposedBy: ids.author, actionType: "shortlist_draft_prepare",
    actionDigest: digest, evidenceRefs: [], proposalKey: opKey,
  }), /NEXUS_INVALID_PROPOSAL/);
  assert.equal(s.calls.length, 0);
});

test("human approval uses exact action digest and task version", async () => {
  const s = spy([[{ outcome: "approved", task_version: 2, approval_id: ids.approval }]]);
  const receipt = await decideNexusProposal(s.db, {
    taskId: ids.task, reviewedBy: ids.reviewer, expectedVersion: 1,
    decision: "approved", actionDigest: digest,
  });
  assert.deepEqual(receipt, { decision: "approved", taskVersion: 2, approvalId: ids.approval });
  assert.deepEqual(s.calls[0].values, [ids.task, ids.reviewer, 1, "approved", digest]);
  assert.match(s.calls[0].sql, /core\.decide_nexus_review_task/);
});

test("repository reads typed task and approval from private core schema", async () => {
  const s = spy([
    [{
      id: ids.task, brand_id: ids.brand, status: "approved", version: 2,
      action_type: "shortlist_draft_prepare", action_digest: digest,
      proposed_by: ids.author, quality_reviewed: true, evidence_refs: ["source:1"],
      preflight_passed: false, preflight_checked_at: null,
    }],
    [{
      id: ids.approval, task_id: ids.task, brand_id: ids.brand,
      task_version: 2, action_type: "shortlist_draft_prepare",
      action_digest: digest, decision: "approved", reviewed_by: ids.reviewer,
      expires_at: new Date("2026-10-16T12:00:00Z"),
    }],
  ]);
  const repo = makeNexusPostgresClaimRepository(s.db);
  const task = await repo.loadTask(ids.task);
  const approval = await repo.loadApproval(ids.task);
  assert.equal(task?.brandId, ids.brand);
  assert.equal(task?.preflightPassed, false);
  assert.equal(task?.preflightCheckedAt, "");
  assert.equal(approval?.reviewedBy, ids.reviewer);
  assert.equal(approval?.expiresAt, "2026-10-16T12:00:00.000Z");
  assert.match(s.calls[0].sql, /core\.nexus_execution_tasks/);
  assert.match(s.calls[1].sql, /core\.nexus_execution_approvals/);
});

test("claim executes only the database reservation function and maps a durable receipt", async () => {
  const s = spy([[{ outcome: "claimed", claim_id: ids.claim }]]);
  const repo = makeNexusPostgresClaimRepository(s.db);
  const output = await repo.claimAtomically({
    taskId: ids.task, brandId: ids.brand, expectedVersion: 2,
    approvedBy: ids.reviewer, approvalId: ids.approval,
    actionType: "shortlist_draft_prepare", actionDigest: digest,
    claimedBy: ids.executor, idempotencyKey: opKey, claimedAt: "2026-10-15T21:00:00Z",
  });
  assert.deepEqual(output, { kind: "claimed", claimId: ids.claim });
  assert.match(s.calls[0].sql, /core\.claim_nexus_execution_task/);
  assert.ok(!/\binsert\b|\bupdate\b|\bdelete\b/i.test(s.calls[0].sql));
  assert.deepEqual(s.calls[0].values, [
    ids.task, 2, ids.executor, ids.approval, "shortlist_draft_prepare", digest, opKey,
  ]);
});

test("stale transaction maps to a non-success result; unexpected failures propagate", async () => {
  const sample = {
    taskId: ids.task, brandId: ids.brand, expectedVersion: 2,
    approvedBy: ids.reviewer, approvalId: ids.approval,
    actionType: "shortlist_draft_prepare", actionDigest: digest,
    claimedBy: ids.executor, idempotencyKey: opKey, claimedAt: "2026-10-15T21:00:00Z",
  };
  const sqlError: NexusSqlClient = { async query() { throw Object.assign(new Error("stale"), { code: "40001" }); } };
  assert.deepEqual(await makeNexusPostgresClaimRepository(sqlError).claimAtomically(sample), { kind: "stale" });
  const unavailable: NexusSqlClient = { async query() { throw new Error("db offline"); } };
  await assert.rejects(makeNexusPostgresClaimRepository(unavailable).claimAtomically(sample), /db offline/);
});

test("post-claim adapter returns current eligibility without suggesting execution occurred",async()=>{
  const s = spy([[{outcome:"eligible_now",reason:null,claim_id:ids.claim}]]);
  const result=await inspectNexusClaimBeforeDispatch(s.db,{claimId:ids.claim,verifiedActorId:ids.executor});
  assert.deepEqual(result,{status:"eligible_now",reason:null,claimId:ids.claim});
  assert.deepEqual(s.calls[0].values,[ids.claim,ids.executor]);
  assert.match(s.calls[0].sql,/core\.revalidate_nexus_claim_before_dispatch/);
  assert.doesNotMatch(s.calls[0].sql,/\b(insert|update|delete)\b/i);
});
test("post-claim adapter returns cancelled with audited reason, without invoking a worker",async()=>{
  const s=spy([[{outcome:"cancelled",reason:"approval_revoked",claim_id:ids.claim}]]);
  const result=await inspectNexusClaimBeforeDispatch(s.db,{claimId:ids.claim,verifiedActorId:ids.executor});
  assert.deepEqual(result,{status:"cancelled",reason:"approval_revoked",claimId:ids.claim});
  assert.equal(s.calls.length,1);
});
test("post-claim adapter rejects malformed principal or forged result",async()=>{
  const invalid=spy();
  await assert.rejects(inspectNexusClaimBeforeDispatch(invalid.db,{claimId:"no",verifiedActorId:ids.executor}),/NEXUS_INVALID_UUID/);
  await assert.rejects(inspectNexusClaimBeforeDispatch(invalid.db,{claimId:ids.claim,verifiedActorId:"fake"}),/NEXUS_INVALID_UUID/);
  assert.equal(invalid.calls.length,0);
  const unexpected=spy([[{outcome:"executed",reason:null,claim_id:ids.claim}]]);
  await assert.rejects(inspectNexusClaimBeforeDispatch(unexpected.db,{claimId:ids.claim,verifiedActorId:ids.executor}),/NEXUS_DISPATCH_CHECK_INVALID_RECEIPT/);
  const spoof=spy([[{outcome:"eligible_now",reason:null,claim_id:ids.task}]]);
  await assert.rejects(inspectNexusClaimBeforeDispatch(spoof.db,{claimId:ids.claim,verifiedActorId:ids.executor}),/NEXUS_DISPATCH_CHECK_INVALID_RECEIPT/);
  const noReason=spy([[{outcome:"cancelled",reason:null,claim_id:ids.claim}]]);
  await assert.rejects(inspectNexusClaimBeforeDispatch(noReason.db,{claimId:ids.claim,verifiedActorId:ids.executor}),/NEXUS_DISPATCH_CHECK_INVALID_RECEIPT/);
});
