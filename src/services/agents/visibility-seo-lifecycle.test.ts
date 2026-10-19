import assert from "node:assert/strict";
import { it } from "node:test";
import { summarizeVisibilitySeoLifecycle } from "./visibility-seo-lifecycle";
const sha="a".repeat(40);
const release={brandId:"zeneco",targetUrl:"https://www.zenecohomes.com/guide",repository:"freddybremseth-coder/zenecohomes",commitSha:sha,deploymentCommitSha:sha,deploymentState:"READY" as const,deployedAt:"2026-09-01T12:00:00Z",observedPublicUrl:"https://www.zenecohomes.com/guide",verifiedPublicAt:"2026-09-01T13:00:00Z"};
const before={start:"2026-08-01",end:"2026-08-30",query:"bolig",page:"/guide",clicks:2,impressions:40,position:15};
const after={start:"2026-09-02",end:"2026-10-01",query:"bolig",page:"/guide",clicks:4,impressions:60,position:10};
it("never infers impact without a Nexus task and verified release",()=>{
 assert.equal(summarizeVisibilitySeoLifecycle({nexusWorkItemId:null,releaseEvidence:release,before,after}).stage,"INVESTIGATE");
 assert.equal(summarizeVisibilitySeoLifecycle({nexusWorkItemId:"task",releaseEvidence:null,before,after}).stage,"RELEASE_UNVERIFIED");
});
it("only reports noncausal measured impact for exact pre/post release windows",()=>{
 const result=summarizeVisibilitySeoLifecycle({nexusWorkItemId:"task",releaseEvidence:release,before,after});
 assert.equal(result.stage,"IMPACT_OBSERVED");
 assert.equal(result.deltas.position,5);
 assert.equal(result.impactCausationVerified,false);
 assert.equal(result.publicationAuthorized,false);
});
it("rejects comparison spanning deployment",()=>{
 const result=summarizeVisibilitySeoLifecycle({nexusWorkItemId:"task",releaseEvidence:release,before:{...before,end:"2026-09-01"},after});
 assert.equal(result.stage,"AWAITING_AFTER_MEASUREMENT");
});