import assert from "node:assert/strict";
import test from "node:test";
import { assessClaimEvidence, type ClaimEvidence } from "./visibility-project-evidence";

const sample: ClaimEvidence = {
 fact: { key: "price", value: "349000 EUR", sourceUrl: "https://example.org/brochure", checkedAt: "2026-10-18", verifiedByHuman: true },
 sourceKind: "developer_document", sourceTitle: "Dated developer brochure",
 reviewerId: "reviewer-1", reviewedAt: "2026-10-18T18:00:00Z",
};

test("complete submitted attestation still cannot imply verification or publication", () => {
 const result = assessClaimEvidence([sample]);
 assert.equal(result.readiness, "READY_FOR_INDEPENDENT_CHECK");
 assert.equal(result.independentlyVerified, false);
 assert.equal(result.approvalGranted, false);
 assert.equal(result.publicationEligible, false);
});
test("missing reviewer, source and acknowledgement remain incomplete", () => {
 const result = assessClaimEvidence([{...sample, fact: {...sample.fact, sourceUrl: undefined, verifiedByHuman: false}, reviewerId: "", sourceTitle: ""}]);
 assert.equal(result.readiness, "EVIDENCE_INCOMPLETE");
 assert.ok(result.issues.some(issue => issue.reason === "REVIEWER_MISSING"));
 assert.ok(result.issues.some(issue => issue.reason === "SOURCE_MISSING"));
 assert.ok(result.issues.some(issue => issue.reason === "ATTESTATION_MISSING"));
});
test("empty records never count as verified", () => {
 const result = assessClaimEvidence([]);
 assert.equal(result.readiness, "NO_EVIDENCE");
 assert.equal(result.independentlyVerified, false);
});
