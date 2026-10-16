/**
 * Disposable PostgreSQL CI only. Real multi-connection concurrency and
 * cross-brand admission tests for the staged claim RPC. No external action
 * runs and no production Supabase connection is ever opened.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";

const A = "11111111-1111-4111-8111-111111111111";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPOSER_A = "22222222-2222-4222-8222-222222222222";
const PROPOSER_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVIEWER = "33333333-3333-4333-8333-333333333333";
const EXECUTOR_A = "44444444-4444-4444-8444-444444444444";
const ACTION = "shortlist_draft_prepare";
const DIGEST = "sha256:" + "d".repeat(64);
const freshKey = () => "op_" + randomBytes(20).toString("hex");

type Admission = { outcome: "claimed" | "duplicate"; claim_id: string };
type Task = { taskId: string; approvalId: string };

function openClient() {
  assert.equal(process.env.GITHUB_ACTIONS, "true", "GitHub Actions required");
  assert.equal(process.env.NEXUS_BOARD_CI_ONLY, "true", "Disposable CI database required");
  assert.equal(process.env.NEXUS_CLAIM_CI_ONLY, "true", "Claim test opt-in required");
  return new pg.Client({
    host: "127.0.0.1", port: 5432, database: "postgres",
    user: "postgres", password: process.env.PGPASSWORD,
    ssl: false, connectionTimeoutMillis: 4000, statement_timeout: 10000,
  });
}
async function createApprovedTask(client: pg.Client, brandId: string, proposerId: string): Promise<Task> {
  const taskId = randomUUID();
  const approvalId = randomUUID();
  await client.query(
    \`insert into core.nexus_execution_tasks
      (id,brand_id,status,version,action_type,action_digest,proposed_by,
       quality_reviewed,evidence_refs,preflight_passed,preflight_checked_at)
     values ($1,$2,'approved',1,$3,$4,$5,true,
       array['ci:independent-evidence'],true,clock_timestamp())\`,
    [taskId, brandId, ACTION, DIGEST, proposerId],
  );
  await client.query(
    \`insert into core.nexus_execution_approvals
      (id,task_id,brand_id,task_version,action_type,action_digest,
       decision,reviewed_by,expires_at)
     values ($1,$2,$3,1,$4,$5,'approved',$6,clock_timestamp() + interval '10 minutes')\`,
    [approvalId, taskId, brandId, ACTION, DIGEST, REVIEWER],
  );
  return { taskId, approvalId };
}
async function claim(client: pg.Client, task: Task, idempotencyKey: string, actor = EXECUTOR_A) {
  const result = await client.query<Admission>(
    "select outcome,claim_id from core.claim_nexus_execution_task($1::uuid,1,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)",
    [task.taskId,actor,task.approvalId,ACTION,DIGEST,idempotencyKey],
  );
  return result.rows[0];
}
async function proveCommittedOnce(client: pg.Client, task: Task, expected: "claimed" | "not-claimed") {
  const r = await client.query(
    \`select t.status,t.version,
         (select count(*)::int from core.nexus_execution_claims c where c.task_id=t.id) as claims,
         (select count(*)::int from core.nexus_execution_claim_events e where e.task_id=t.id) as events
       from core.nexus_execution_tasks t where t.id=$1::uuid\`,
    [task.taskId],
  );
  assert.equal(r.rowCount, 1);
  const state = r.rows[0];
  if (expected === "claimed") {
    assert.deepEqual([state.status, state.version, state.claims, state.events],["executing",2,1,1]);
  } else {
    assert.deepEqual([state.status, state.version, state.claims, state.events],["approved",1,0,0]);
  }
}
test("parallel identical claims share one durable receipt with one audit event", async () => {
  const [admin,worker1,worker2] = [openClient(),openClient(),openClient()];
  try {
    await Promise.all([admin.connect(),worker1.connect(),worker2.connect()]);
    const task=await createApprovedTask(admin,A,PROPOSER_A);
    const key=freshKey();
    const [first,second]=await Promise.all([claim(worker1,task,key),claim(worker2,task,key)]);
    assert.deepEqual([first.outcome,second.outcome].sort(),["claimed","duplicate"]);
    assert.equal(first.claim_id,second.claim_id);
    assert.equal((await claim(worker2,task,key)).claim_id,first.claim_id);
    await proveCommittedOnce(admin,task,"claimed");
  } finally {
    await Promise.all([admin,worker1,worker2].map(c=>c.end().catch(()=>undefined)));
  }
});
test("parallel different idempotency keys cannot reserve the same task twice", async () => {
  const [admin,worker1,worker2] = [openClient(),openClient(),openClient()];
  try {
    await Promise.all([admin.connect(),worker1.connect(),worker2.connect()]);
    const task=await createApprovedTask(admin,A,PROPOSER_A);
    const [a,b]=await Promise.allSettled([
      claim(worker1,task,freshKey()),claim(worker2,task,freshKey()),
    ]);
    assert.equal([a,b].filter(x=>x.status==="fulfilled").length,1);
    assert.equal([a,b].filter(x=>x.status==="rejected").length,1);
    const winner=[a,b].find(x=>x.status==="fulfilled");
    const loser=[a,b].find(x=>x.status==="rejected");
    assert.equal(winner?.status==="fulfilled"&&winner.value.outcome,"claimed");
    assert.equal(loser?.status==="rejected" && (loser.reason as {code?:string}).code,"23505");
    await proveCommittedOnce(admin,task,"claimed");
  } finally {
    await Promise.all([admin,worker1,worker2].map(c=>c.end().catch(()=>undefined)));
  }
});
test("foreign brand executor cannot claim even a valid, preflight-approved task", async () => {
  const [admin,worker]=[openClient(),openClient()];
  try {
    await Promise.all([admin.connect(),worker.connect()]);
    const task=await createApprovedTask(admin,B,PROPOSER_B);
    await assert.rejects(
      claim(worker,task,freshKey(),EXECUTOR_A),
      (error: unknown) => typeof error==="object" && error!==null
        && "code" in error && error.code==="42501",
    );
    await proveCommittedOnce(admin,task,"not-claimed");
  } finally {
    await Promise.all([admin,worker].map(c=>c.end().catch(()=>undefined)));
  }
});
