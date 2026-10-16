/**
 * Post-claim dispatch cancellation; disposable PostgreSQL 16 CI ONLY.
 * Neither this test nor its SQL functions dispatch external actions.
 */
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import test from "node:test";
import pg from "pg";

const BRAND="11111111-1111-4111-8111-111111111111";
const AUTHOR="22222222-2222-4222-8222-222222222222";
const REVIEWER="33333333-3333-4333-8333-333333333333";
const EXECUTOR="44444444-4444-4444-8444-444444444444";
const ACTION="shortlist_draft_prepare";
const DIGEST="sha256:"+"e".repeat(64);
const freshKey=()=>"op_"+randomBytes(20).toString("hex");
type Fixture={taskId:string; approvalId:string; claimId:string; operationKey:string};
type Decision={outcome:string; reason:string|null; claim_id:string};
function connect(){
 assert.equal(process.env.GITHUB_ACTIONS,"true");
 assert.equal(process.env.NEXUS_CLAIM_CI_ONLY,"true");
 assert.equal(process.env.NEXUS_BOARD_CI_ONLY,"true");
 return new pg.Client({host:"127.0.0.1",port:5432,database:"postgres",
   user:"postgres",password:process.env.PGPASSWORD,ssl:false,
   connectionTimeoutMillis:4000,statement_timeout:10000});
}
async function fixture(c:pg.Client):Promise<Fixture>{
 const taskId=randomUUID(),approvalId=randomUUID(),operationKey=freshKey();
 await c.query(
  "insert into core.nexus_execution_tasks"+
  " (id,brand_id,status,version,action_type,action_digest,proposed_by,quality_reviewed,evidence_refs,preflight_passed,preflight_checked_at)"+
  " values($1,$2,'approved',1,$3,$4,$5,true,array['ci:evidence'],true,clock_timestamp())",
  [taskId,BRAND,ACTION,DIGEST,AUTHOR]);
 await c.query(
  "insert into core.nexus_execution_approvals"+
  " (id,task_id,brand_id,task_version,action_type,action_digest,decision,reviewed_by,expires_at)"+
  " values($1,$2,$3,1,$4,$5,'approved',$6,clock_timestamp()+interval '10 minutes')",
  [approvalId,taskId,BRAND,ACTION,DIGEST,REVIEWER]);
 const r=await c.query(
  "select outcome,claim_id from core.claim_nexus_execution_task($1::uuid,1,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)",
  [taskId,EXECUTOR,approvalId,ACTION,DIGEST,operationKey]);
 assert.equal(r.rows[0]?.outcome,"claimed");
 return {taskId,approvalId,claimId:String(r.rows[0].claim_id),operationKey};
}
async function check(c:pg.Client,f:Fixture,actor=EXECUTOR):Promise<Decision>{
 const r=await c.query<Decision>(
  "select outcome,reason,claim_id from core.revalidate_nexus_claim_before_dispatch($1::uuid,$2::uuid)",
  [f.claimId,actor]);
 assert.equal(r.rows.length,1);
 return r.rows[0];
}
async function assertState(c:pg.Client,f:Fixture,status:"executing"|"cancelled",reason?:string){
 const r=await c.query(
  "select t.status,t.version,"+
  " (select count(*)::int from core.nexus_execution_claims c where c.task_id=t.id) claims,"+
  " (select count(*)::int from core.nexus_execution_claim_events e where e.task_id=t.id) claim_events,"+
  " (select count(*)::int from core.nexus_execution_dispatch_events e where e.task_id=t.id) cancel_events"+
  " from core.nexus_execution_tasks t where t.id=$1::uuid",[f.taskId]);
 assert.equal(r.rows.length,1);
 assert.deepEqual([r.rows[0].status,r.rows[0].version,r.rows[0].claims,r.rows[0].claim_events,r.rows[0].cancel_events],
  status==="executing"?["executing",2,1,1,0]:["cancelled",3,1,1,1]);
 if(reason){
  const e=await c.query("select reason from core.nexus_execution_dispatch_events where claim_id=$1::uuid",[f.claimId]);
  assert.equal(e.rows[0].reason,reason);
 }
}
async function backendPid(c:pg.Client){
 const r=await c.query("select pg_backend_pid()::int pid");
 return Number(r.rows[0].pid);
}
async function assertBlocked(observer:pg.Client,waiter:number,blocker:number){
 for(let i=0;i<180;i++){
  const r=await observer.query("select pg_blocking_pids($1::int) blocking",[waiter]);
  if((r.rows[0]?.blocking as number[]|undefined)?.includes(blocker))return;
  await pause(25);
 }
 throw Error("Expected PostgreSQL row-lock contention missing");
}
const settled=<T>(p:Promise<T>)=>p.then(value=>({ok:true as const,value}),error=>({ok:false as const,error}));

test("current claim returns eligible_now without dispatch or audit side effects",async()=>{
 const c=connect();try{
  await c.connect();const f=await fixture(c);
  assert.deepEqual(await check(c,f),{outcome:"eligible_now",reason:null,claim_id:f.claimId});
  await assertState(c,f,"executing");
 }finally{await c.end().catch(()=>undefined);}
});
test("approval revoked after claim cancels exactly once and replay cannot resurrect it",async()=>{
 const c=connect();try{
  await c.connect();const f=await fixture(c);
  await c.query("update core.nexus_execution_approvals set revoked_at=clock_timestamp() where id=$1::uuid",[f.approvalId]);
  const expected={outcome:"cancelled",reason:"approval_revoked",claim_id:f.claimId};
  assert.deepEqual(await check(c,f),expected);
  assert.deepEqual(await check(c,f),expected);
  await assertState(c,f,"cancelled","approval_revoked");
  await assert.rejects(c.query(
   "select * from core.claim_nexus_execution_task($1::uuid,1,$2::uuid,$3::uuid,$4::text,$5::text,$6::text)",
   [f.taskId,EXECUTOR,f.approvalId,ACTION,DIGEST,f.operationKey]),
   (e:unknown)=>!!e&&typeof e==="object"&&"code" in e&&e.code==="22023");
 }finally{await c.end().catch(()=>undefined);}
});
test("wrong actor cannot inspect or cancel; expired approval cancels the actual claimant",async()=>{
 const c=connect();try{
  await c.connect();const f=await fixture(c);
  await assert.rejects(check(c,f,REVIEWER),
    (e:unknown)=>!!e&&typeof e==="object"&&"code" in e&&e.code==="42501");
  await assertState(c,f,"executing");
  await c.query("update core.nexus_execution_approvals set expires_at=clock_timestamp()-interval '1 second' where id=$1::uuid",[f.approvalId]);
  assert.deepEqual(await check(c,f),{outcome:"cancelled",reason:"approval_expired",claim_id:f.claimId});
  await assertState(c,f,"cancelled","approval_expired");
 }finally{await c.end().catch(()=>undefined);}
});
test("revoked executor permission cancels a previously committed claim",async()=>{
 const c=connect();try{
  await c.connect();const f=await fixture(c);
  await c.query("update core.nexus_execution_authorizations set enabled=false where brand_id=$1::uuid and user_id=$2::uuid and capability='execute'",[BRAND,EXECUTOR]);
  assert.deepEqual(await check(c,f),{outcome:"cancelled",reason:"executor_scope_denied",claim_id:f.claimId});
  await assertState(c,f,"cancelled","executor_scope_denied");
 }finally{
  await c.query("update core.nexus_execution_authorizations set enabled=true where brand_id=$1::uuid and user_id=$2::uuid and capability='execute'",[BRAND,EXECUTOR]).catch(()=>undefined);
  await c.end().catch(()=>undefined);
 }
});
test("revocation and parallel rechecks serialize to a single cancellation event",async()=>{
 const [admin,revoker,w1,w2]=[connect(),connect(),connect(),connect()];
 let pending1:ReturnType<typeof settled<Decision>>|undefined;
 let pending2:ReturnType<typeof settled<Decision>>|undefined;
 try{
  await Promise.all([admin,revoker,w1,w2].map(c=>c.connect()));
  const f=await fixture(admin);
  // node-postgres queues queries per connection: resolve backend PIDs
  // BEFORE submitting a claim check which will block on a SQL row lock.
  const waiterPid=await backendPid(w1);
  const secondWaiterPid=await backendPid(w2);
  const blockerPid=await backendPid(revoker);
  await revoker.query("begin");
  await revoker.query("update core.nexus_execution_approvals set revoked_at=clock_timestamp() where id=$1::uuid",[f.approvalId]);
  // Coordinate the lock chain deliberately: w1 must wait on the revoked
  // approval; w2 must wait on w1's task lock. Launching both before the
  // first assertion races their task-lock acquisition and creates flaky CI.
  pending1=settled(check(w1,f));
  await assertBlocked(admin,waiterPid,blockerPid);
  pending2=settled(check(w2,f));
  await assertBlocked(admin,secondWaiterPid,waiterPid);
  await revoker.query("commit");
  const [a,b]=await Promise.all([pending1,pending2]);
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  if(a.ok&&b.ok){
    const expected={outcome:"cancelled",reason:"approval_revoked",claim_id:f.claimId};
    assert.deepEqual(a.value,expected);assert.deepEqual(b.value,expected);
  }
  await assertState(admin,f,"cancelled","approval_revoked");
 }finally{
  await revoker.query("rollback").catch(()=>undefined);
  await Promise.all([pending1,pending2].filter(Boolean)).catch(()=>undefined);
  await Promise.all([admin,revoker,w1,w2].map(c=>c.end().catch(()=>undefined)));
 }
});
