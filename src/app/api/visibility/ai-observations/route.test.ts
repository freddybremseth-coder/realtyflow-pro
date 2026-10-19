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

it("allows a signed test owner to read and insert against a local mocked Supabase REST gateway",async()=>{
 const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS","NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"] as const;
 const oldEnv=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 const oldFetch=globalThis.fetch;
 const calls:{method:string;body:unknown}[]=[];
 try {
  // These are deliberately synthetic values. This test never connects to a live database.
  process.env.REALTYFLOW_SESSION_SECRET="visibility-ci-local-only-signing-key";
  process.env.REALTYFLOW_ADMIN_EMAILS="visibility-ci-owner@example.test";
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://visibility-ci.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY="visibility-ci-fake-service-key";
  globalThis.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
   assert.match(url,/^https:\/\/visibility-ci\.invalid\/rest\/v1\/visibility_ai_observations(?:\?|$)/);
   const method=String(init?.method||"GET").toUpperCase();
   const body=init?.body ? JSON.parse(String(init.body)) : null;
   calls.push({method,body});
   if(method==="POST") {
    assert.equal(body.brand_id,"zeneco");
    assert.equal(body.evidence_state,"CITED");
    assert.equal(body.verification_state,"UNVERIFIED");
    assert.equal(body.captured_by,"manual");
    return new Response(JSON.stringify({id:"00000000-0000-4000-8000-000000000001"}),{status:201,headers:{"content-type":"application/json"}});
   }
   return new Response(JSON.stringify([]),{status:200,headers:{"content-type":"application/json"}});
  };
  const {createAdminSession}=await import("@/lib/admin-auth");
  const {NextRequest}=await import("next/server");
  const {GET,POST}=await import("./route");
  const cookie="realtyflow_admin="+await createAdminSession("visibility-ci-owner@example.test");
  const endpoint="https://realtyflow.test/api/visibility/ai-observations";
  const read=await GET(new NextRequest(endpoint,{headers:{cookie}}));
  assert.equal(read.status,200);
  assert.deepEqual((await read.json()).observations,[]);
  const write=await POST(new NextRequest(endpoint,{
   method:"POST",headers:{cookie,origin:"https://realtyflow.test","content-type":"application/json"},
   body:JSON.stringify({brandId:"zeneco",provider:"chatgpt",prompt:"Guide to Albir?",
    locale:"en-GB",responseExcerpt:"Sample manual answer",
    citedUrls:["https://www.zenecohomes.com/guide/example"],brandMentioned:true,
    capturedBy:"manual",observedAt:new Date().toISOString()})
  }));
  assert.equal(write.status,201);
  const json=await write.json();
  assert.equal(json.state,"CITED");
  assert.equal(json.verification_state,"UNVERIFIED");
  assert.deepEqual(calls.map(call=>call.method),["GET","POST"]);
  const denied=await POST(new NextRequest(endpoint,{
   method:"POST",headers:{cookie,origin:"https://attacker.example","content-type":"application/json"},
   body:JSON.stringify({brandId:"zeneco"})
  }));
  assert.equal(denied.status,403);
  assert.equal(calls.length,2,"Cross-site requests must not reach database gateway");
 } finally {
  globalThis.fetch=oldFetch;
  for(const key of keys){const value=oldEnv[key];if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
