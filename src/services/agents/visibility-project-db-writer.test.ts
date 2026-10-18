import assert from "node:assert/strict";
import test from "node:test";
import {createProjectEvidenceWriter} from "./visibility-project-db-writer";
import {prepareProjectEvidenceLog} from "./visibility-project-evidence-log";
const row=prepareProjectEvidenceLog({eventId:"event-123456",brandId:"zeneco",projectUrl:"https://www.zenecohomes.com/eiendommer/N6299",claimKey:"price",event:"SOURCE_RECORDED",actorId:"owner-1",recordedAt:"2026-10-18T19:00:00Z"},"owner-1");
const collision={code:"23505",message:"duplicate key value violates unique constraint \"ux_visibility_project_claim_event_id\""};
test("true duplicate returns already_exists only on matching payload",async()=>{
 const writer=createProjectEvidenceWriter({insert:async()=>({data:null,error:collision}),findByEventId:async()=>({data:{details:row.details},error:null})});
 const result=await writer.insertIfAbsent(row,"event-123456"); assert.equal(result.outcome,"already_exists");
});
test("same event id with different payload is conflict",async()=>{
 const writer=createProjectEvidenceWriter({insert:async()=>({data:null,error:collision}),findByEventId:async()=>({data:{details:{...row.details,actor_id:"other"}},error:null})});
 assert.equal((await writer.insertIfAbsent(row,"event-123456")).outcome,"conflict");
});
test("unrelated constraint error is never treated as duplicate",async()=>{
 const writer=createProjectEvidenceWriter({insert:async()=>({data:null,error:{code:"23505",message:"other_unique"}}),findByEventId:async()=>{throw Error("should not read");}});
 const r=await writer.insertIfAbsent(row,"event-123456");assert.ok(r.error);
});
test("normal insert keeps idempotency status explicit",async()=>{
 const writer=createProjectEvidenceWriter({insert:async()=>({data:{},error:null}),findByEventId:async()=>{throw Error("should not read");}});
 assert.equal((await writer.insertIfAbsent(row,"event-123456")).outcome,"inserted");
});
