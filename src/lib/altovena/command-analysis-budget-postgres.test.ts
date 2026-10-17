import test from "node:test";
import assert from "node:assert/strict";
import {
  createPrivateAnalysisAdmissionRepository,
  type PrivateAnalysisDb,
} from "./command-analysis-budget-postgres";

const scope={
  tenantId:"dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9",
  missionId:"b8ce3e82-f928-4db1-b532-716980699805",
  agentId:"business",
  verifiedActorId:"5db6a674-823a-4c48-9d39-e7bea29b967a",
  goalDigest:"a".repeat(64),routingDigest:"b".repeat(64),
};
const permit={
  permitId:"6f5b3c18-762d-4a8b-b6bb-d8bce987ed53",
  ...scope,model:"gpt-5.6",expiresAt:"2026-10-17T09:05:00Z",
  maxOutputTokens:650,maxInputTokens:1200,reservedCostCents:10,
  status:"approved_for_read_only_analysis" as const,
};
const id="9f27560b-435d-4698-a6f8-64b6ea4e2b45";
const input={scope,permit,evidenceDigest:"c".repeat(64)};
const makeDb=(rows:Record<string,unknown>[]=[
 {result_kind:"reserved",result_reservation_id:id},
])=>{
  const calls:{sql:string;args:readonly unknown[]}[]=[];
  const db:PrivateAnalysisDb={
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
      calls.push({sql,args});return {rows:rows as T[]};
    },
  };
  return {db,calls};
};

test("the database, not caller flags, rechecks all 11 model and identity fields",async()=>{
 const {db,calls}=makeDb();
 const repo=createPrivateAnalysisAdmissionRepository(db);
 assert.deepEqual(await repo.reserve(input),{kind:"reserved",reservationId:id});
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/altovena.reserve_analysis_budget/);
 assert.equal((calls[0].sql.match(/\$\d+/g)||[]).length,11);
 assert.deepEqual(calls[0].args,[
   permit.permitId,scope.tenantId,scope.verifiedActorId,input.evidenceDigest,
   permit.agentId,permit.model,permit.goalDigest,permit.routingDigest,
   permit.maxInputTokens,permit.maxOutputTokens,permit.reservedCostCents,
 ]);
});
test("scope manipulation is denied before a database query",async()=>{
 const {db,calls}=makeDb();
 const repo=createPrivateAnalysisAdmissionRepository(db);
 assert.deepEqual(await repo.reserve({
   ...input,permit:{...permit,model:"gpt-5.6",tenantId:"5f71dabd-28d3-4b31-a32a-87d756b3456a"},
 }),{kind:"denied"});
 assert.equal(calls.length,0);
});
test("duplicate permit receipts cannot send the provider twice",async()=>{
 const {db}=makeDb([{result_kind:"duplicate",result_reservation_id:null}]);
 assert.deepEqual(
   await createPrivateAnalysisAdmissionRepository(db).reserve(input),
   {kind:"duplicate"});
});
test("SQL permission/budget denial is not confused with an infrastructure error",async()=>{
 const denied:PrivateAnalysisDb={async query(){throw Object.assign(Error("no"),{code:"42501"});}};
 assert.deepEqual(await createPrivateAnalysisAdmissionRepository(denied).reserve(input),
   {kind:"denied"});
 const down:PrivateAnalysisDb={async query(){throw Object.assign(Error("DB unavailable"),{code:"08006"});}};
 await assert.rejects(createPrivateAnalysisAdmissionRepository(down).reserve(input),
   /DB unavailable/);
});
test("settlement stores usage only through the private database function",async()=>{
 const {db,calls}=makeDb([{result:"settled"}]);
 const repo=createPrivateAnalysisAdmissionRepository(db);
 await repo.settle({
   reservationId:id,state:"completed",
   usage:{inputTokens:250,outputTokens:150,totalTokens:400},
   resultDigest:"d".repeat(64),
 });
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/altovena.settle_analysis_budget/);
 assert.deepEqual(calls[0].args,[id,"completed",250,150,400,"d".repeat(64)]);
});
test("unknown provider outcome keeps full reserve and marks cost as uncertain",async()=>{
 const {db,calls}=makeDb([{result:"already_settled"}]);
 const repo=createPrivateAnalysisAdmissionRepository(db);
 await repo.settle({reservationId:id,state:"uncertain",usage:null,resultDigest:null});
 assert.deepEqual(calls[0].args,[id,"uncertain",null,null,null,null]);
});
