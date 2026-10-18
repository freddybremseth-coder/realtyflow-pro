import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkVisibilityPullCi } from "./visibility-github-ci";
import type { VisibilityCodeCandidate } from "./visibility-code-candidate";
import type { VisibilityPullStatus } from "./visibility-github-pr-status";
import { parseVisualReviewInput,latestVisualReviewForCandidate,VISUAL_CHECKS } from "./visibility-visual-review";

const sha="2d0ca74b5ec3ba4467ebf30f3264c13687b07ff3";
const now=new Date("2026-10-17T16:40:00Z");
const candidate:VisibilityCodeCandidate={
 repo:"freddybremseth-coder/remasterfreddy",pullNumber:48,
 url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48",
 commitSha:sha,recordedAt:"2026-10-17T13:39:33Z",
 reviewOnly:true,executionStarted:false,publicationAuthorized:false,
};
const github:VisibilityPullStatus={
 state:"OPEN_SAME_COMMIT",checkedAt:now.toISOString(),currentHeadSha:sha,
 codeUnchanged:true,mergeAuthorized:false,publicationAuthorized:false,
 verifiedAsPublished:false,
};
const runs=(state="completed",conclusion:string|null="success")=>({
 total_count:1,check_runs:[{name:"build-test",head_sha:sha,status:state,conclusion}],
});
function mock(data:unknown,status=200){
 let endpoint="";
 const fn=(async(url:string|URL|Request)=>{
  endpoint=String(url);return new Response(JSON.stringify(data),{status});
 }) as typeof fetch;
 return {fn,get endpoint(){return endpoint}};
}
test("one exact green required CI job is observed, but never an approval",async()=>{
 const api=mock(runs());
 const result=await checkVisibilityPullCi(candidate,github,api.fn,now);
 assert.equal(api.endpoint,"https://api.github.com/repos/freddybremseth-coder/remasterfreddy/commits/"+sha+"/check-runs?per_page=30");
 assert.equal(result.state,"PASSED");
 assert.equal(result.requiredJob,"build-test");
 assert.equal(result.reviewedSha,sha);
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.publicationAuthorized,false);
 assert.equal(result.visualReviewCompleted,false);
});
test("red, pending, wrong SHA, missing required job, and truncation fail closed",async()=>{
 for(const [data,state] of [
  [runs("completed","failure"),"FAILED"],
  [runs("in_progress",null),"PENDING"],
  [runs("completed","skipped"),"UNVERIFIED"],
  [{total_count:1,check_runs:[{...runs().check_runs[0],head_sha:"b".repeat(40)}]},"UNVERIFIED"],
  [{total_count:1,check_runs:[{...runs().check_runs[0],name:"unrelated"}]},"UNVERIFIED"],
  [{total_count:31,check_runs:runs().check_runs},"UNVERIFIED"],
 ] as const){
  const result=await checkVisibilityPullCi(candidate,github,mock(data).fn,now);
  assert.equal(result.state,state);
  assert.equal(result.publicationAuthorized,false);
 }
 assert.equal((await checkVisibilityPullCi(candidate,github,mock(runs(),403).fn,now)).state,"UNVERIFIED");
});
test("do not query GitHub if PR commit changed or repository not permitted",async()=>{
 let calls=0;
 const fn=(async()=>{calls++;return new Response(JSON.stringify(runs()))}) as typeof fetch;
 assert.equal((await checkVisibilityPullCi(candidate,{...github,state:"COMMIT_CHANGED",currentHeadSha:"f".repeat(40)},fn,now)).state,"COMMIT_CHANGED");
 assert.equal((await checkVisibilityPullCi({...candidate,repo:"evil/repo"},github,fn,now)).state,"UNVERIFIED");
 assert.equal(calls,0);
});
const checks={desktop:true,mobile:true,adminNoindex:true,singleH1AfterHydration:true,noVisualRegression:true};
const input={workItemId:"00000000-0000-4000-8000-000000000001",commitSha:sha,
 outcome:"VISUALLY_PASSED",checks,notes:"Inspected the same test preview on mobile and desktop."};
test("all five human visual observations are mandatory for a passing attestation",()=>{
 assert.equal(VISUAL_CHECKS.length,5);
 assert.equal(parseVisualReviewInput(input)?.outcome,"VISUALLY_PASSED");
 for(const key of VISUAL_CHECKS){
  assert.equal(parseVisualReviewInput({...input,checks:{...checks,[key]:false}}),null);
 }
 assert.equal(parseVisualReviewInput({...input,notes:"short"}),null);
 assert.equal(parseVisualReviewInput({...input,commitSha:"bad"}),null);
 assert.equal(parseVisualReviewInput({...input,checks:{...checks,approvedToPublish:true}}),null);
 assert.equal(parseVisualReviewInput({...input,checks:{...checks,desktop:"yes"}}),null);
 assert.equal(parseVisualReviewInput({...input,checks:{...checks,desktop:false},outcome:"ISSUES_FOUND"})?.outcome,"ISSUES_FOUND");
});
test("visual attestations display only on exact matching SHA and never grant a release",()=>{
 const record={created_at:"2026-10-17T16:40:00Z",
  details:{
   work_item_id:input.workItemId,commit_sha:sha,review_kind:"manual_visual_review_only",
   outcome:input.outcome,checks,notes:input.notes,
   approval_granted:false,merge_authorized:false,
   publication_authorized:false,execution_started:false,
  }};
 const valid=latestVisualReviewForCandidate(input.workItemId,sha,[record]);
 assert.equal(valid?.outcome,"VISUALLY_PASSED");
 assert.equal(valid?.publishingApproved,false);
 assert.equal(valid?.mergingApproved,false);
 assert.equal(latestVisualReviewForCandidate(input.workItemId,"f".repeat(40),[record]),null);
 assert.equal(latestVisualReviewForCandidate(input.workItemId,sha,[{
  ...record,details:{...record.details,merge_authorized:true},
 }]),null);
});
test("manual record endpoint strictly owner only, rechecks GitHub, writes no publication approval",()=>{
 const read=(p:string)=>readFileSync(new URL("../../../"+p,import.meta.url),"utf8");
 const api=read("src/app/api/visibility/work-items/visual-review/route.ts");
 const list=read("src/app/api/visibility/work-items/route.ts");
 const ui=read("src/components/visibility/visibility-work-queue.tsx");
 assert.match(api,/ctx\?\.role!=="OWNER"/);
 assert.match(api,/ctx\.source!=="owner-session"/);
 assert.match(api,/sec-fetch-site/);
 assert.match(api,/checkVisibilityPullStatus\(candidate\)/);
 assert.match(api,/checkVisibilityPullCi\(candidate,live\)/);
 assert.match(api,/input\.outcome==="VISUALLY_PASSED" && ci\.state!=="PASSED"/);
 assert.match(api,/github_ci_reviewed_sha:ci\.reviewedSha/);
 assert.match(api,/ciState:ci\.state/);
 assert.match(api,/live\.state!=="OPEN_SAME_COMMIT"/);
 assert.match(api,/merge_authorized:false/);
 assert.match(api,/publication_authorized:false/);
 assert.doesNotMatch(api,/from\("work_items"\)\.update\(/);
 assert.match(list,/latestVisualReviewForCandidate/);
 assert.match(ui,/VisibilityVisualReviewForm/);
});
