import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveVisibilityCodeCandidate, VISIBILITY_CODE_CANDIDATE_ACTION } from "./visibility-code-candidate";

const item = {
 id:"00000000-0000-4000-8000-000000000001",
 brand_id:"remasterfreddy",
 source_id:"visibility:remasterfreddy:"+"a".repeat(40),
};
const request={
 id:"00000000-0000-4000-8000-000000000010",
 created_at:"2026-10-17T13:22:00Z",
 details:{
  work_item_id:item.id,brand_id:item.brand_id,source_id:item.source_id,
  intent:"design_review_only",approval_granted:false,
  publication_authorized:false,execution_started:false,
  proposal_fingerprint:"b".repeat(64),
 },
};
const candidate={
 created_at:"2026-10-17T13:45:00Z",
 details:{
  work_item_id:item.id,brand_id:item.brand_id,source_id:item.source_id,
  candidate_kind:"review_only_pull_request",review_only:true,
  approval_granted:false,publication_authorized:false,
  merge_authorized:false,execution_started:false,
  design_request_log_id:request.id,proposal_fingerprint:request.details.proposal_fingerprint,
  repo:"freddybremseth-coder/remasterfreddy",
  pull_number:48,url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48",
  commit_sha:"c".repeat(40),
 },
};
test("review-only candidate bridges a genuine owner request to one exact GitHub PR",()=>{
 const result=resolveVisibilityCodeCandidate(item,[request],[candidate]);
 assert.equal(result?.pullNumber,48);
 assert.equal(result?.url,candidate.details.url);
 assert.equal(result?.commitSha,candidate.details.commit_sha);
 assert.equal(result?.reviewOnly,true);
 assert.equal(result?.publicationAuthorized,false);
 assert.equal(result?.executionStarted,false);
 assert.equal(VISIBILITY_CODE_CANDIDATE_ACTION,"visibility_code_review_candidate");
});
test("unrequested or unrelated PRs cannot be shown against a Nexus work item",()=>{
 assert.equal(resolveVisibilityCodeCandidate(item,[],[candidate]),null);
 assert.equal(resolveVisibilityCodeCandidate({...item,id:"00000000-0000-4000-8000-000000000099"},[request],[candidate]),null);
 assert.equal(resolveVisibilityCodeCandidate({...item,brand_id:"zeneco"},[request],[candidate]),null);
 assert.equal(resolveVisibilityCodeCandidate(item,[request],[{
  ...candidate,details:{...candidate.details,design_request_log_id:"unrelated"},
 }]),null);
});
test("rejects client-like URL tricks, wrong repo, fake SHA and implicit approval",()=>{
 const bad=[
  {url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48?approved=true"},
  {url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48#merged"},
  {url:"https://github.com.evil.test/freddybremseth-coder/remasterfreddy/pull/48"},
  {url:"https://github.com/other/remasterfreddy/pull/48"},
  {repo:"freddybremseth-coder/realtyflow-pro"},
  {commit_sha:"not-a-git-commit"},
  {publication_authorized:true},
  {approval_granted:true},
  {execution_started:true},
  {merge_authorized:true},
  {review_only:false},
  {candidate_kind:"approved_code_release"},
  {proposal_fingerprint:"f".repeat(64)},
 ];
 for(const diff of bad)
   assert.equal(resolveVisibilityCodeCandidate(item,[request],[{
     ...candidate,details:{...candidate.details,...diff},
   }]),null,JSON.stringify(diff));
});
test("candidate cannot predate the owner's actual request",()=>{
 assert.equal(resolveVisibilityCodeCandidate(item,[request],[{
  ...candidate,created_at:"2026-10-17T13:00:00Z",
 }]),null);
});
test("request must itself be a recorded design-only, non-authorizing intent",()=>{
 for(const diff of [
  {approval_granted:true},{publication_authorized:true},{execution_started:true},
  {intent:"approve_and_publish"},{proposal_fingerprint:"bad"},
 ])assert.equal(resolveVisibilityCodeCandidate(item,[{
  ...request,details:{...request.details,...diff},
 }],[candidate]),null);
});
test("queue uses service-only audit provenance and UI never offers a merge control",()=>{
 const api=readFileSync(new URL("../../../src/app/api/visibility/work-items/route.ts",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../../../src/components/visibility/visibility-work-queue.tsx",import.meta.url),"utf8");
 assert.match(api,/ctx\?\.role!=="OWNER"/);
 assert.match(api,/ctx\.source!=="owner-session"/);
 assert.match(api,/VISIBILITY_CODE_CANDIDATE_ACTION/);
 assert.match(api,/resolveVisibilityCodeCandidate/);
 assert.match(ui,/Kodeforslag til gjennomgang/);
 assert.match(ui,/noopener noreferrer/);
 assert.match(ui,/Ingen sammenslåing eller publisering er godkjent/);
 assert.doesNotMatch(ui,/onClick=\{[^}]*merge/);
});
