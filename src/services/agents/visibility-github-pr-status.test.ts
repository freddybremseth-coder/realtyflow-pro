import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { checkVisibilityPullStatus, MAX_GITHUB_PR_STATUS_CHECKS } from "./visibility-github-pr-status";
import type { VisibilityCodeCandidate } from "./visibility-code-candidate";

const known="2d0ca74b5ec3ba4467ebf30f3264c13687b07ff3";
const candidate:VisibilityCodeCandidate={
 url:"https://github.com/freddybremseth-coder/remasterfreddy/pull/48",
 repo:"freddybremseth-coder/remasterfreddy",
 pullNumber:48,commitSha:known,recordedAt:"2026-10-17T13:39:33Z",
 reviewOnly:true,executionStarted:false,publicationAuthorized:false,
};
const now=new Date("2026-10-17T14:42:00Z");
const body={
 number:48,html_url:candidate.url,state:"open",draft:false,merged_at:null,
 head:{sha:known},base:{repo:{full_name:candidate.repo}},
};
function mockTransport(payload:unknown,status=200){
 let called="";
 let settings:RequestInit|undefined;
 const transport=(async(url:string|URL|Request, init?:RequestInit)=>{
  called=String(url);settings=init;
  return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
 }) as typeof fetch;
 return {transport, get called(){return called},get settings(){return settings}};
}
test("open unchanged PR is a read-only observation, never an approval",async()=>{
 const m=mockTransport(body);
 const result=await checkVisibilityPullStatus(candidate,m.transport,now);
 assert.equal(m.called,"https://api.github.com/repos/freddybremseth-coder/remasterfreddy/pulls/48");
 assert.equal(m.settings?.method,"GET");
 assert.equal(m.settings?.cache,"no-store");
 assert.equal(m.settings?.redirect,"error");
 assert.equal(result.state,"OPEN_SAME_COMMIT");
 assert.equal(result.currentHeadSha,known);
 assert.equal(result.codeUnchanged,true);
 assert.equal(result.checkedAt,now.toISOString());
 assert.equal(result.mergeAuthorized,false);
 assert.equal(result.publicationAuthorized,false);
 assert.equal(result.verifiedAsPublished,false);
 assert.equal(MAX_GITHUB_PR_STATUS_CHECKS,2);
});
test("draft, changed commit, closed and merged are distinct from open matching",async()=>{
 const fresh="f".repeat(40);
 for(const [input,expected] of [
  [{...body,draft:true},"DRAFT_SAME_COMMIT"],
  [{...body,head:{sha:fresh}},"COMMIT_CHANGED"],
  [{...body,state:"closed"},"CLOSED"],
  [{...body,state:"closed",merged_at:"2026-10-17T14:40:00Z"},"MERGED"],
 ] as const){
  const result=await checkVisibilityPullStatus(candidate,mockTransport(input).transport,now);
  assert.equal(result.state,expected);
  assert.equal(result.publicationAuthorized,false);
  assert.equal(result.mergeAuthorized,false);
  assert.equal(result.verifiedAsPublished,false);
 }
});
test("wrong GitHub repository, PR number, URL, malformed payload or rate limit fail closed",async()=>{
 for(const invalid of [
  {repo:"another/repo"},{pullNumber:0},{url:"https://github.com.evil.test/steal"},
  {reviewOnly:false},{executionStarted:true},{publicationAuthorized:true},
 ]){
  let called=0;
  const transport=(async()=>{called++;return new Response(JSON.stringify(body));}) as typeof fetch;
  const result=await checkVisibilityPullStatus({...candidate,...invalid} as VisibilityCodeCandidate,transport,now);
  assert.equal(result.state,"UNAVAILABLE");
  assert.equal(result.codeUnchanged,false);
  assert.equal(called,0);
 }
 for(const invalid of [
   {...body,head:{sha:"bad"}},
   {...body,number:47},
   {...body,base:{repo:{full_name:"another/repo"}}},
   {...body,html_url:"https://github.com/another/repo/pull/48"},
   {...body,draft:"false"},
   {...body,state:"unexpected"},
   {...body,state:"open",merged_at:"2026-10-17T14:40:00Z"},
 ]){
  const result=await checkVisibilityPullStatus(candidate,mockTransport(invalid).transport,now);
  assert.equal(result.state,"UNAVAILABLE");
 }
 assert.equal((await checkVisibilityPullStatus(candidate,mockTransport(body,429).transport,now)).state,"UNAVAILABLE");
 const broken=(async()=>{throw new Error("GitHub inaccessible")}) as typeof fetch;
 assert.equal((await checkVisibilityPullStatus(candidate,broken,now)).state,"UNAVAILABLE");
});
test("oversized GitHub metadata fails closed even with misleading Content-Length",async()=>{
 const declared=(async()=>new Response(JSON.stringify(body),{
  headers:{"content-length":"100001"},
 })) as typeof fetch;
 assert.equal((await checkVisibilityPullStatus(candidate,declared,now)).state,"UNAVAILABLE");
 const largePayload=JSON.stringify(body)+" ".repeat(100_100);
 const streamed=(async()=>new Response(new ReadableStream<Uint8Array>({
  start(controller){controller.enqueue(new TextEncoder().encode(largePayload));controller.close();}
 }))) as typeof fetch;
 assert.equal((await checkVisibilityPullStatus(candidate,streamed,now)).state,"UNAVAILABLE");
});
test("live GitHub status route is owner-only, capped and does not merge or publish",()=>{
 const read=(path:string)=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");
 const api=read("src/app/api/visibility/work-items/route.ts");
 const ui=read("src/components/visibility/visibility-work-queue.tsx");
 const checker=read("src/services/agents/visibility-github-pr-status.ts");
 assert.match(api,/ctx\?\.role!=="OWNER"/);
 assert.match(api,/ctx\.source!=="owner-session"/);
 assert.match(api,/\.slice\(0,MAX_GITHUB_PR_STATUS_CHECKS\)/);
 assert.match(api,/checkVisibilityPullStatus/);
 assert.match(ui,/GitHub-status kunne ikke bekreftes/);
 assert.match(ui,/Kodeversjonen er endret/);
 assert.match(ui,/Oppdater GitHub-status/);
 assert.doesNotMatch(checker,/method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
 assert.doesNotMatch(ui,/onClick=\{[^}]*merge/);
});
