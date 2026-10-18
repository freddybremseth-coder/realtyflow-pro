import assert from "node:assert/strict";
import test from "node:test";
import { inspectProjectEvidenceHistory, type ProjectEvidenceEvent } from "./visibility-project-evidence-history";

const source: ProjectEvidenceEvent = {
 eventId: "event-1", brandId: "zeneco", projectUrl: "https://www.zenecohomes.com/eiendommer/N6299",
 claimKey: "price", event: "SOURCE_RECORDED", actorId: "server-resolved-user", recordedAt: "2026-10-18T19:00:00Z",
 evidence: { fact: {key:"price",value:"Example only", verifiedByHuman:true},
  sourceTitle:"Developer factsheet", documentId:"internal-document-id",
  sourceKind:"developer_document",reviewerId:"server-resolved-user",reviewedAt:"2026-10-18T19:00:00Z" }
};
test("append-only source attestation and revocation never authorize publishing",()=>{
 const result=inspectProjectEvidenceHistory([
   source,
   {...source,eventId:"event-2",event:"REVIEW_ATTESTED",recordedAt:"2026-10-18T19:01:00Z"},
   {...source,eventId:"event-3",event:"REVIEW_REVOKED",recordedAt:"2026-10-18T19:02:00Z"},
 ]);
 assert.equal(result.claims[0].reviewAttested,false);
 assert.equal(result.claims[0].revoked,true);
 assert.equal(result.approvalGranted,false);
 assert.equal(result.publicationEligible,false);
});
test("review with no prior source cannot appear attested",()=>{
 const result=inspectProjectEvidenceHistory([{...source,event:"REVIEW_ATTESTED"}]);
 assert.ok(result.issues.includes("REVIEW_WITHOUT_SOURCE"));
 assert.equal(result.claims[0].reviewAttested,false);
});
