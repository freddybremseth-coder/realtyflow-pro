
/**
 * PostgreSQL lock-order/revocation regression tests.
 * Disposable GitHub Actions PostgreSQL ONLY. No real Supabase, customer
 * credentials, external executor, publishing or mail effects.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import pg from "pg";

const BRAND = "11111111-1111-4111-8111-111111111111";
const PROPOSER = "22222222-2222-4222-8222-222222222222";
const REVIEWER = "33333333-3333-4333-8333-333333333333";
const EXECUTOR = "44444444-4444-4444-8444-444444444444";
const ACTION = "shortlist_draft_prepare";
const DIGEST = "sha256:" + "f".repeat(64);
const key = () => "op_" + randomBytes(20).toString("hex");
const OPEN = "approved";

type Fixture = {taskId:string; approvalId:string};
type RaceResult = {ok:true;value:unknown}|{ok:false;error:unknown};
function connect() {
  assert.equal(process.env.GITHUB_ACTIONS,"true","GitHub Actions only");
  assert.equal(process.env.NEXUS_BOARD_CI_ONLY,"true","Disposable DB only");
  assert.equal(process.env.NEXUS_CLAIM_CI_ONLY,"true","Nexus CI opt-in required");
  return new pg.Client({
    host:"127.0.0.1",port:5432,database:"postgres",user:"postgres",
    password:process.env.PGPASSWORD,ssl:false,
    connectionTimeoutMillis:4000,statement_timeout:10000,
  });
}
async function taskFixture(admin:pg.Client, approvalExpirySql = "clock_timestamp() + interval '10 minutes'"):Promise<Fixture>{
  const taskId=randomUUID(),approvalId=randomUUID();
  await admin.query(
    `insert into core.nexus_execution_tasks
       (id,brand_id,status,version,action_type,action_digest,proposed_by,
        quality_reviewed,evidence_refs,preflight_passed,preflight_checked_at)
     values($1,$2,$3,1,$4,$5,$6,true,array['ci:evidence'],true,clock_timestamp())`,
    [taskId,BRAND,OPEN,ACTION,DIGEST,PROPOSER]
  );
  // SQL fragment only from the two hard-coded fixture calls in this file.
  assert.ok(["clock_timestamp() + interval '10 minutes'",
             "clock_timestamp() + interval '350 milliseconds'"].includes(approvalExpirySql));
  await admin.query(
    `insert into core.nexus_execution_approvals
       (id,task_id,brand_id,task_version,action_type,action_digest,decision,reviewed_by,expires_at)
     values($1,$2,$3,1,$4,$5,'approved',$6,${approvalExpirySql})`,
    [approvalId,taskId,BRAND,ACTION,DIGEST,REVIEWER]
  );
  return {taskId,approvalId};
}
function reserve(client:pg.Client,fixture:Fixture){
  return client.query(
    "select outcome,claim_id from core.claim_nexus_execution_task($1::uuid,1,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)",
    [fixture.taskId,EXECUTOR,fixture.approvalId,ACTION,DIGEST,key()],
  );
}
async function pidOf(c:pg.Client):Promise<number>{
  const x=await c.query("select pg_backend_pid()::int as pid");
  return Number(x.rows[0].pid);
}
async function blockedOn(observer:pg.Client,waiterPid:number,blockerPid:number){
  for(let i=0;i<160;i++){
    const r=await observer.query("select pg_blocking_pids($1::int) as blockers",[waiterPid]);
    if((r.rows[0]?.blockers as number[]|undefined)?.includes(blockerPid))return;
    await pause(25);
  }
  throw Error("NEXUS_EXPECTED_LOCK_CONTENTION_NOT_OBSERVED");
}
function finished(p:Promise<unknown>):Promise<RaceResult>{
  // Attach the rejection handler immediately to avoid transient unhandled
  // promise rejections while checking real PostgreSQL lock contention.
  return p.then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));
}
function assertDenied(result:RaceResult,code:string){
  assert.equal(result.ok,false,"Claim must not be reserved");
  if(!result.ok){
    assert.equal((result.error as {code?:string})?.code,code);
  }
}
async function assertNoClaim(admin:pg.Client,f:Fixture){
  const r=await admin.query(
    `select t.status,t.version,
      (select count(*)::int from core.nexus_execution_claims c where c.task_id=t.id) as nclaims,
      (select count(*)::int from core.nexus_execution_claim_events e where e.task_id=t.id) as nevents
     from core.nexus_execution_tasks t where t.id=$1::uuid`,[f.taskId]
  );
  assert.deepEqual([r.rows[0].status,r.rows[0].version,r.rows[0].nclaims,r.rows[0].nevents],
    [OPEN,1,0,0]);
}

test("revocation committed while claim waits on the approval row blocks reservation",async()=>{
  const [admin,revoker,worker]=[connect(),connect(),connect()];
  let pending:Promise<RaceResult>|undefined;
  try {
    await Promise.all([admin.connect(),revoker.connect(),worker.connect()]);
    const fixture=await taskFixture(admin);
    await revoker.query("begin");
    await revoker.query(
      "update core.nexus_execution_approvals set revoked_at=clock_timestamp() where id=$1::uuid",
      [fixture.approvalId]
    );
    const waiterPid=await pidOf(worker),blockerPid=await pidOf(revoker);
    pending=finished(reserve(worker,fixture));
    await blockedOn(admin,waiterPid,blockerPid);
    await revoker.query("commit");
    assertDenied(await pending,"22023");
    await assertNoClaim(admin,fixture);
  }finally{
    await revoker.query("rollback").catch(()=>undefined);
    if(pending)await pending.catch(()=>undefined);
    await Promise.all([admin,revoker,worker].map(c=>c.end().catch(()=>undefined)));
  }
});

test("disabled executor capability committed during a grant lock wait blocks reservation",async()=>{
  const [admin,revoker,worker]=[connect(),connect(),connect()];
  let pending:Promise<RaceResult>|undefined;
  try{
    await Promise.all([admin.connect(),revoker.connect(),worker.connect()]);
    const fixture=await taskFixture(admin);
    await revoker.query("begin");
    await revoker.query(
      `update core.nexus_execution_authorizations
       set enabled=false where brand_id=$1::uuid and user_id=$2::uuid and capability='execute'`,
      [BRAND,EXECUTOR]
    );
    const waiterPid=await pidOf(worker),blockerPid=await pidOf(revoker);
    pending=finished(reserve(worker,fixture));
    await blockedOn(admin,waiterPid,blockerPid);
    await revoker.query("commit");
    assertDenied(await pending,"42501");
    await assertNoClaim(admin,fixture);
  }finally{
    await revoker.query("rollback").catch(()=>undefined);
    if(pending)await pending.catch(()=>undefined);
    // This fixture also supports other tests; restore only CI-created state.
    await admin.query(
      `update core.nexus_execution_authorizations set enabled=true
       where brand_id=$1::uuid and user_id=$2::uuid and capability='execute'`,
      [BRAND,EXECUTOR]
    ).catch(()=>undefined);
    await Promise.all([admin,revoker,worker].map(c=>c.end().catch(()=>undefined)));
  }
});

test("approval expiring during a lock wait is rechecked at claim commit boundary",async()=>{
  const [admin,holder,worker]=[connect(),connect(),connect()];
  let pending:Promise<RaceResult>|undefined;
  try{
    await Promise.all([admin.connect(),holder.connect(),worker.connect()]);
    const f=await taskFixture(admin,"clock_timestamp() + interval '350 milliseconds'");
    await holder.query("begin");
    await holder.query(
      "select id from core.nexus_execution_approvals where id=$1::uuid for update",[f.approvalId]
    );
    const waiterPid=await pidOf(worker),blockerPid=await pidOf(holder);
    pending=finished(reserve(worker,f));
    await blockedOn(admin,waiterPid,blockerPid);
    // Ensure the expiration happens AFTER the claim entered its SQL function,
    // BEFORE the approval row becomes available to it.
    await admin.query("select pg_sleep(0.5)");
    await holder.query("commit");
    assertDenied(await pending,"22023");
    await assertNoClaim(admin,f);
  }finally{
    await holder.query("rollback").catch(()=>undefined);
    if(pending)await pending.catch(()=>undefined);
    await Promise.all([admin,holder,worker].map(c=>c.end().catch(()=>undefined)));
  }
});
