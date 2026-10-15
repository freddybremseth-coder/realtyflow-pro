import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { visibilityApprovalId, visibilityApprovalScope, validVisibilityApproval, canRunApprovedDonaAnnaMetadata } from "./visibility-owner-approval";
import { publisherForBrand } from "./seo-brand-publishing";

const scope = visibilityApprovalScope();
const now=new Date("2026-10-15T13:00:00.000Z");
function grant(overrides:Record<string,unknown>={}) {
  return { ...scope,approvedBy:"owner@example.com",approvedAt:"2026-10-15T12:00:00.000Z",
    expiresAt:"2026-11-14T12:00:00.000Z",decision:"approved",...overrides };
}
test("consent is restricted to Doña Anna homepage and exactly one metadata variant",()=>{
  assert.equal(scope.brandId,"donaanna");
  assert.equal(scope.version,"v1");
  assert.equal(scope.file,"index.html");
  assert.equal(scope.scope,"homepage_title_description");
  assert.match(visibilityApprovalId(),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[0-9a-f]{4}-[a-f0-9]{12}$/);
  assert.equal(validVisibilityApproval(grant(),now),true);
  assert.equal(validVisibilityApproval(grant({title:"different title"}),now),false);
  assert.equal(validVisibilityApproval(grant({origin:"https://other.example/"}),now),false);
  assert.equal(validVisibilityApproval(grant({version:"v2"}),now),false);
  assert.equal(validVisibilityApproval(grant({decision:"revoked"}),now),false);
});
test("stale or future grants never open the daily publication gate",()=>{
  assert.equal(validVisibilityApproval(grant({expiresAt:"2026-10-15T12:00:00Z"}),now),false);
  assert.equal(validVisibilityApproval(grant({approvedAt:"2026-10-16T12:00:00Z"}),now),false);
  assert.equal(validVisibilityApproval(grant({expiresAt:"2027-05-01T12:00:00Z"}),now),false);
});
test("Dona Anna fails closed when consent lookup is not available",async()=>{
  const site=publisherForBrand("donaanna")!;
  const db={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({error:{message:"db offline"}})})})})})} as any;
  await assert.rejects(canRunApprovedDonaAnnaMetadata(db,site,"v1",now),/consent state unavailable/);
  assert.equal(await canRunApprovedDonaAnnaMetadata(db,site,"v2",now),false);
  assert.equal(await canRunApprovedDonaAnnaMetadata(db,publisherForBrand("pinosoecolife")!,"v1",now),true);
});
test("route is owner-only and scoped; product has no demo publish action",()=>{
  const base=process.cwd();
  const api=fs.readFileSync(path.join(base,"src/app/api/visibility/approval/route.ts"),"utf8");
  const product=fs.readFileSync(path.join(base,"src/components/visibility/visibility-product-console.tsx"),"utf8");
  const ui=fs.readFileSync(path.join(base,"src/components/visibility/dona-anna-approval.tsx"),"utf8");
  const publisher=fs.readFileSync(path.join(base,"src/services/agents/seo-brand-publisher.ts"),"utf8");
  assert.match(api,/ctx\.source==="owner-session"/);
  assert.match(api,/sec-fetch-site/);
  assert.match(api,/expectedFingerprint/);
  assert.doesNotMatch(ui,/VISIBILITY_DEMO/); // Parent gates live-only rendering.
  assert.match(product,/mode==="live" && f\.category==="publishing"/);
  assert.match(ui,/Gi begrenset publiseringstillatelse/);
  assert.match(ui,/Trekk tilbake tillatelsen/);
  assert.match(publisher,/canRunApprovedDonaAnnaMetadata\(db,site,"v1",now\)/);
});

test("direct Dona Anna publisher invocation fails closed before any GitHub write without consent",async()=>{
  const {runBrandPublisher}=await import("./seo-brand-publisher");
  let githubCalls=0;
  const fakeDb={from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})})} as any;
  const status=await runBrandPublisher(fakeDb,publisherForBrand("donaanna")!,null,{
    github:async()=>{githubCalls++;throw Error("never call github");},
    publicHtml:async()=>{throw Error("never fetch public source");},now,
  });
  assert.equal(status.status,"blocked");
  assert.match(status.reason,/tillatelse/);
  assert.equal(githubCalls,0);
});
