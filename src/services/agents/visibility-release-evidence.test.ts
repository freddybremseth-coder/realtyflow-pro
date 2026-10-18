import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessVisibilityReleaseEvidence, type VisibilityReleaseEvidence } from "./visibility-release-evidence";

const sha = "a".repeat(40);
const evidence: VisibilityReleaseEvidence = {
  brandId: "zeneco", targetUrl: "https://www.zenecohomes.com/guide",
  repository: "freddybremseth-coder/zenecohomes", commitSha: sha,
  deploymentCommitSha: sha, deploymentState: "READY",
  deployedAt: "2026-10-10T10:00:00Z",
  observedPublicUrl: "https://www.zenecohomes.com/guide",
  verifiedPublicAt: "2026-10-10T11:00:00Z",
};
describe("Visibility release evidence", () => {
  it("only accepts matching release evidence; never authorizes publication or proves SEO causation", () => {
    const result = assessVisibilityReleaseEvidence(evidence);
    assert.equal(result.state, "RELEASE_VERIFIED");
    assert.equal(result.publicationAuthorized, false);
    assert.equal(result.impactCausationVerified, false);
  });
  it("rejects mismatched commits or unfinished deployment", () => {
    assert.equal(assessVisibilityReleaseEvidence({...evidence,deploymentCommitSha:"b".repeat(40)}).state,"UNVERIFIED");
    assert.equal(assessVisibilityReleaseEvidence({...evidence,deploymentState:"PENDING"}).state,"UNVERIFIED");
  });
  it("rejects nonmatching URL and early/missing public verification", () => {
    assert.equal(assessVisibilityReleaseEvidence({...evidence,observedPublicUrl:"https://www.zenecohomes.com/other"}).state,"UNVERIFIED");
    assert.equal(assessVisibilityReleaseEvidence({...evidence,verifiedPublicAt:"2026-10-10T09:00:00Z"}).state,"UNVERIFIED");
    assert.equal(assessVisibilityReleaseEvidence({...evidence,verifiedPublicAt:null}).state,"UNVERIFIED");
  });
});
