import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
const route=readFileSync(new URL("./route.ts",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../../../../supabase/migrations/20261018193000_visibility_ai_observations.sql",import.meta.url),"utf8");
it("read and write require owner session and write origin admission",()=>{
 assert.match(route,/getRequestAccessContext\(request\)/);
 assert.match(route,/ctx\?\.role==="OWNER"&&ctx\.source==="owner-session"/);
 assert.match(route,/if\(!await owner\(request\)\)/g);
 assert.match(route,/request\.headers\.get\("origin"\)/);
 assert.match(route,/sec-fetch-site/);
});
it("only accepts manually reported AI observations, never marks them independently verified",()=>{
 assert.match(route,/input\.capturedBy!=="manual"/);
 assert.match(route,/verification_state:"UNVERIFIED"/);
 assert.doesNotMatch(route,/verification_state:"INDEPENDENTLY_VERIFIED"/);
});
it("uses bounded owner-only database reads and disables cache",()=>{
 assert.match(route,/\.eq\("brand_id","zeneco"\)/);
 assert.match(route,/\.limit\(100\)/);
 assert.match(route,/private, no-store/);
});
it("migration denies public read and enables RLS without altering existing records",()=>{
 assert.match(migration,/alter table public\.visibility_ai_observations enable row level security;/);
 assert.match(migration,/revoke all on public\.visibility_ai_observations from anon, authenticated;/);
 assert.doesNotMatch(migration,/drop table|truncate table|delete from/i);
});

it("rejects actual unauthenticated GET and POST requests before any database access",async()=>{
 const {NextRequest}=await import("next/server");
 const {GET,POST}=await import("./route");
 const url="https://realtyflow.test/api/visibility/ai-observations";
 const getResponse=await GET(new NextRequest(url,{method:"GET"}));
 assert.equal(getResponse.status,403);
 const postResponse=await POST(new NextRequest(url,{
  method:"POST",headers:{"origin":"https://realtyflow.test","content-type":"application/json"},
  body:JSON.stringify({brandId:"zeneco",provider:"chatgpt",prompt:"Test",locale:"nb-NO",responseExcerpt:"Test",citedUrls:[],brandMentioned:false,capturedBy:"manual",observedAt:"2026-10-18T19:00:00.000Z"})
 }));
 assert.equal(postResponse.status,403);
});
