import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {POST,GET,DELETE} from "../../src/app/api/altovena/staging-auth/route";
import {ALTOVENA_STAGING_COOKIE} from "../../src/lib/altovena/staging-session";

const address="https://realtyflow-preview.test/api/altovena/staging-auth";
const keys=["VERCEL_ENV","ALTOVENA_STAGING_LOGIN_ENABLED",
 "ALTOVENA_STAGING_ISOLATION_ENABLED","ALTOVENA_STAGING_SUPABASE_PROJECT_REF",
 "ALTOVENA_STAGING_SUPABASE_URL","ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
 "ALTOVENA_STAGING_SUPABASE_ANON_KEY"];
let old:Record<string,string|undefined>={};
const submit=(origin="https://realtyflow-preview.test",
 extra:Record<string,string>={},content=JSON.stringify({email:"staff@example.invalid",password:"test-password"}))=>
 new NextRequest(address,{method:"POST",headers:{
  host:"realtyflow-preview.test","x-forwarded-host":"realtyflow-preview.test",
  origin,"content-type":"application/json",...extra,
 },body:content});
test.beforeEach(()=>{
 old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.VERCEL_ENV="preview";
 delete process.env.ALTOVENA_STAGING_LOGIN_ENABLED;
 delete process.env.ALTOVENA_STAGING_ISOLATION_ENABLED;
 delete process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF;
 delete process.env.ALTOVENA_STAGING_SUPABASE_URL;
 delete process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY;
 delete process.env.ALTOVENA_STAGING_SUPABASE_ANON_KEY;
});
test.afterEach(()=>{
 for(const [k,v] of Object.entries(old))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test("login is disabled by default and cannot issue a staging or platform cookie",async()=>{
 const r=await POST(submit());
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"STAGING_LOGIN_DISABLED");
 assert.equal(r.headers.get("set-cookie"),null);
});
test("production hard block even if all staging flags are enabled",async()=>{
 process.env.VERCEL_ENV="production";
 process.env.ALTOVENA_STAGING_LOGIN_ENABLED="true";
 const r=await POST(submit());
 assert.equal(r.status,503);
 assert.equal(r.headers.get("set-cookie"),null);
});
test("CSRF origin mismatch, missing origin and forwarded host mismatch are rejected before Auth",async()=>{
 process.env.ALTOVENA_STAGING_LOGIN_ENABLED="true";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF="abcdefghijklmnopqrst";
 process.env.ALTOVENA_STAGING_SUPABASE_URL="https://abcdefghijklmnopqrst.supabase.co";
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-test-only";
 const rejected=[
  submit("https://attacker.example"),
  submit("http://realtyflow-preview.test"),
  submit(""),
  submit("https://realtyflow-preview.test",{"x-forwarded-host":"other.example"}),
  submit("https://realtyflow-preview.test",{"content-type":"text/plain"}),
 ];
 for(const req of rejected){
  const r=await POST(req);
  assert.ok([400,403].includes(r.status));
  assert.equal(r.headers.get("set-cookie"),null);
 }
});
test("valid-origin request without isolated staging DB cannot contact Auth or create cookie",async()=>{
 process.env.ALTOVENA_STAGING_LOGIN_ENABLED="true";
 const r=await POST(submit());
 assert.equal(r.status,503);
 assert.equal(r.headers.get("set-cookie"),null);
});
test("preview logout clears only the Altovena-scoped cookie",async()=>{
 const req=new NextRequest(address,{method:"DELETE",headers:{
  host:"realtyflow-preview.test","x-forwarded-host":"realtyflow-preview.test",
  origin:"https://realtyflow-preview.test",
 }});
 const r=await DELETE(req);
 assert.equal(r.status,200);
 const cookie=r.headers.get("set-cookie")||"";
 assert.ok(cookie.includes(ALTOVENA_STAGING_COOKIE+"="));
 assert.ok(cookie.includes("HttpOnly"));
 assert.ok(cookie.includes("Secure"));
 assert.ok(cookie.includes("SameSite=strict")||cookie.includes("SameSite=Strict"));
 assert.ok(cookie.includes("Path=/api/altovena/staging-auth"));
 assert.ok(!cookie.includes("realtyflow_admin"));
});

test("staging session status is always disabled without isolated config",async()=>{
 const r=await GET(new NextRequest(address,{headers:{
  cookie:ALTOVENA_STAGING_COOKIE+"=forged",
 }}));
 assert.equal(r.status,503);
 assert.equal(r.headers.get("set-cookie"),null);
});
test("an isolated staging environment rejects forged session without DB access",async()=>{
 process.env.ALTOVENA_STAGING_LOGIN_ENABLED="true";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF="abcdefghijklmnopqrst";
 process.env.ALTOVENA_STAGING_SUPABASE_URL="https://abcdefghijklmnopqrst.supabase.co";
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-staging-key";
 const r=await GET(new NextRequest(address,{headers:{
  cookie:ALTOVENA_STAGING_COOKIE+"=forged",
 }}));
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,"STAGING_SESSION_INVALID");
});
