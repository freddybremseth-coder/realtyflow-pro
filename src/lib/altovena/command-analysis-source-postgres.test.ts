import test from "node:test";
import assert from "node:assert/strict";
import {createPrivateEvidenceSnapshotStore} from "./command-analysis-source-postgres";
import type { PrivateAnalysisDb } from "./command-analysis-budget-postgres";
const tenantId="dcc65a7f-d4c4-490d-b4da-8ed6f1b2a0b9";
const missionId="b8ce3e82-f928-4db1-b532-716980699805";
const actorId="5db6a674-823a-4c48-9d39-e7bea29b967a";
const digest="a".repeat(64);
const scope={tenantId,missionId,verifiedActorId:actorId};
const snapshots=[{id:"inspection_01",tenantId,sourceRef:"internal:approved/inspection",
  capturedAt:"2026-10-17T09:53:00.000Z",excerpt:"Known internal source excerpt, ready for immutable capture.",
  excerptDigest:"b".repeat(64)}];
test("private source store binds tenant, mission, actor, digest and exact captured snapshot",async()=>{
  const calls:{sql:string;args:readonly unknown[]}[]=[];
  const db:PrivateAnalysisDb={async query<T extends Record<string,unknown>>(
    sql:string,args:readonly unknown[],
  ){calls.push({sql,args});return {rows:[{result:digest}] as T[]};}};
  const store=createPrivateEvidenceSnapshotStore(db);
  const receipt=await store.save({scope,evidenceDigest:digest,snapshots});
  assert.deepEqual(receipt,{kind:"stored",evidenceDigest:digest,sourceCount:1});
  assert.equal(calls.length,1);
  assert.match(calls[0].sql,/altovena.save_analysis_source_bundle/);
  assert.deepEqual(calls[0].args.slice(0,4),[tenantId,missionId,actorId,digest]);
  assert.deepEqual(JSON.parse(String(calls[0].args[4])),[{
    sourceId:"inspection_01",sourceRef:"internal:approved/inspection",
    capturedAt:"2026-10-17T09:53:00.000Z",
    excerpt:"Known internal source excerpt, ready for immutable capture.",
    excerptDigest:"b".repeat(64),
  }]);
});
test("unexpected persistence receipt never claims a stored bundle",async()=>{
 const db:PrivateAnalysisDb={async query<T extends Record<string,unknown>>() {
   return {rows:[{result:"f".repeat(64)}] as T[]};
 }};
 await assert.rejects(createPrivateEvidenceSnapshotStore(db).save({
   scope,evidenceDigest:digest,snapshots,
 }),/SOURCE_STORE_DURABILITY_UNKNOWN/);
});
test("private database outage propagates; no optimistic success",async()=>{
 const db:PrivateAnalysisDb={async query(){throw Error("database unreachable");}};
 await assert.rejects(createPrivateEvidenceSnapshotStore(db).save({
   scope,evidenceDigest:digest,snapshots,
 }),/database unreachable/);
});
