import assert from "node:assert/strict";
import test from "node:test";
import { appendProjectEvidenceLog, prepareProjectEvidenceLog } from "./visibility-project-evidence-log";
import type { ProjectEvidenceEvent } from "./visibility-project-evidence-history";
const e: ProjectEvidenceEvent = {eventId:"event-123456",brandId:"zeneco",
 projectUrl:"https://www.zenecohomes.com/eiendommer/N6299", claimKey:"price",
 event:"SOURCE_RECORDED",actorId:"staff-1",recordedAt:"2026-10-18T19:00:00Z"};
test("actor spoofing is rejected",()=>assert.throws(()=>prepareProjectEvidenceLog(e,"staff-2"),/ACTOR_MISMATCH/));
test("external target is rejected",()=>assert.throws(()=>prepareProjectEvidenceLog({...e,projectUrl:"https://evil.example/eiendommer/1"},"staff-1"),/UNSUPPORTED_PROJECT_URL/));
test("unauthorized actor never writes",async()=>{
 let calls=0;
 await assert.rejects(()=>appendProjectEvidenceLog({insertIfAbsent:async()=>{calls++;return {outcome:"inserted" as const,error:null};}},e,"staff-1",false),/AUTHORIZATION_REQUIRED/);
 assert.equal(calls,0);
});
test("authorized stub write preserves nonpublishing status",async()=>{
 let saved: unknown;
 const result=await appendProjectEvidenceLog({insertIfAbsent:async row=>{saved=row;return {outcome:"inserted" as const,error:null};}},e,"staff-1",true);
 assert.equal(result.publicationEligible,false);
 assert.equal((saved as {details:{approval_granted:boolean}}).details.approval_granted,false);
});

test("atomic writer duplicate result is not mistaken for a new write",async()=>{
 const result=await appendProjectEvidenceLog({
   insertIfAbsent:async()=>({outcome:"already_exists" as const,error:null})
 },e,"staff-1",true);
 assert.equal(result.alreadyRecorded,true);
 assert.equal(result.publicationEligible,false);
});

test("event id reused for a different payload is a conflict, not idempotent success", async () => {
 await assert.rejects(
   () => appendProjectEvidenceLog({
     insertIfAbsent: async () => ({outcome:"conflict" as const,error:null}),
   },e,"staff-1",true),
   /EVENT_ID_PAYLOAD_CONFLICT/
 );
});
test("event row uses the allowed automation log status", () => {
 const row = prepareProjectEvidenceLog(e,"staff-1");
 assert.equal(row.status,"success");
});
