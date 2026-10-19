import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {summarizePrReviewReadiness} from "./visibility-pr-review-readiness";
import type {VisibilityCodeCandidate} from "./visibility-code-candidate";
import type {VisibilityPullStatus} from "./visibility-github-pr-status";
import type {VisibilityCiEvidence} from "./visibility-github-ci";
import type {VisualReviewRecord} from "./visibility-visual-review";
const now=new Date("2026-10-17T18:00:00Z");
const sha="2d0ca74b5ec3ba4467ebf30f3264c13687b07ff3";
const candidate:VisibilityCodeCandidate={
  url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48",
  repo:"freddybremseth-coder/remasterfreddy",pullNumber:48,
  commitSha:sha,recordedAt:"2026-10-17T13:40:00Z",
  reviewOnly:true,executionStarted:false,publicationAuthorized:false,
};
const github:VisibilityPullStatus={
  state:"OPEN_SAME_COMMIT",checkedAt:"2026-10-17T17:59:00Z",
  currentHeadSha:sha,codeUnchanged:true,
  mergeAuthorized:false,publicationAuthorized:false,verifiedAsPublished:false,
};
const ci:VisibilityCiEvidence={
  state:"PASSED",checkedAt:"2026-10-17T17:59:00Z",reviewedSha:sha,
  requiredJob:"build-test",observedJobs:1,publicationAuthorized:false,
  mergeAuthorized:false,visualReviewCompleted:false,
};
const visual:VisualReviewRecord={
  workItemId:"00000000-0000-4000-8000-000000000001",commitSha:sha,
  recordedAt:"2026-10-17T17:58:00Z",outcome:"VISUALLY_PASSED",
  checks:{desktop:true,mobile:true,adminNoindex:true,singleH1AfterHydration:true,noVisualRegression:true},
  notes:"Actual independent desktop and mobile testing documented.",
  publishingApproved:false,mergingApproved:false,
};
const check=(g:VisibilityPullStatus|null=github,c:VisibilityCiEvidence|null=ci,v:VisualReviewRecord|null=visual)=>
  summarizePrReviewReadiness(candidate,g,c,v,now);
test("all independent evidence can be complete but never grant publish, merge or verification",()=>{
  const r=check();
  assert.equal(r.stage,"REVIEW_EVIDENCE_COMPLETE");
  assert.equal(r.technicalChecksPassed,true);
  assert.equal(r.humanVisualReviewPassed,true);
  assert.equal(r.requiresSeparateReleaseApproval,true);
  assert.equal(r.mergeAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
  assert.equal(r.verifiedAsPublished,false);
});
test("a missing, stale, closed or changed source PR prevents full quality status",()=>{
  assert.equal(summarizePrReviewReadiness(null,github,ci,visual,now).stage,"NO_PR");
  assert.equal(check(null).stage,"GITHUB_UNKNOWN");
  assert.equal(check({...github,checkedAt:"2026-10-17T17:00:00Z"}).stage,"GITHUB_UNKNOWN");
  assert.equal(check({...github,state:"COMMIT_CHANGED",currentHeadSha:"f".repeat(40)}).stage,"PR_CHANGED");
  assert.equal(check({...github,state:"MERGED",codeUnchanged:false}).stage,"PR_CLOSED");
  assert.equal(check({...github,state:"CLOSED",codeUnchanged:false}).stage,"PR_CLOSED");
});
test("red, stale and pending CI cannot unlock visual approval",()=>{
  assert.equal(check(github,{...ci,state:"FAILED"}).stage,"CI_FAILED");
  assert.equal(check(github,{...ci,state:"PENDING"}).stage,"CI_PENDING");
  assert.equal(check(github,{...ci,state:"UNVERIFIED"}).stage,"CI_UNKNOWN");
  assert.equal(check(github,{...ci,reviewedSha:"f".repeat(40)}).stage,"CI_UNKNOWN");
  assert.equal(check(github,{...ci,checkedAt:"2026-10-17T17:40:00Z"}).stage,"CI_UNKNOWN");
  assert.equal(check(github,{...ci,mergeAuthorized:true} as VisibilityCiEvidence).stage,"CI_UNKNOWN");
});
test("visual attestation is always commit-specific, later than candidate and complete",()=>{
  assert.equal(check(github,ci,null).stage,"NEEDS_VISUAL");
  assert.equal(check(github,ci,{...visual,commitSha:"a".repeat(40)}).stage,"NEEDS_VISUAL");
  assert.equal(check(github,ci,{...visual,recordedAt:"2026-10-17T12:00:00Z"}).stage,"NEEDS_VISUAL");
  assert.equal(check(github,ci,{...visual,outcome:"ISSUES_FOUND"}).stage,"VISUAL_ISSUES");
  assert.equal(check(github,ci,{...visual,checks:{...visual.checks,mobile:false}}).stage,"NEEDS_VISUAL");
  assert.equal(check(github,ci,{...visual,publishingApproved:true} as VisualReviewRecord).stage,"NEEDS_VISUAL");
});
test("owner endpoint remains read-only quality presentation without a release action",()=>{
  const load=(p:string)=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
  const api=load("src/app/api/visibility/work-items/route.ts");
  const ui=load("src/components/visibility/visibility-work-queue.tsx");
  assert.match(api,/ctx\?\.role!=="OWNER"/);
  assert.match(api,/ctx\.source!=="owner-session"/);
  assert.match(api,/summarizePrReviewReadiness/);
  assert.match(ui,/Separat release-godkjenning kreves alltid/);
  assert.match(ui,/Historisk visuell kontroll: PR-versjonen er endret/);
  assert.doesNotMatch(ui,/onClick=\{[^}]*merge/);
});
