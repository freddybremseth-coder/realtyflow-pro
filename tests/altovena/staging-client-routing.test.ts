import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {getAltovenaSupabase} from "../../src/lib/altovena/supabase";
import {getPlatformSupabase,setPlatformSupabaseFactoryForTests} from
  "../../src/lib/platform/supabase";

const stage="abcdefghijklmnopqrst",production="ereapsfcsqtdmzosgnnn";
const keys=["VERCEL_ENV","ALTOVENA_STAGING_ISOLATION_ENABLED",
 "ALTOVENA_STAGING_SUPABASE_PROJECT_REF",
 "ALTOVENA_STAGING_SUPABASE_URL",
 "ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
 "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"];
let original:Record<string,string|undefined>={};
let originalFetch:typeof fetch;
test.beforeEach(()=>{
 original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 originalFetch=globalThis.fetch;
 process.env.VERCEL_ENV="preview";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=stage;
 process.env.ALTOVENA_STAGING_SUPABASE_URL=`https://${stage}.supabase.co`;
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="staging-test-key-not-valid-in-real-supabase";
 process.env.NEXT_PUBLIC_SUPABASE_URL=`https://${production}.supabase.co`;
 process.env.SUPABASE_SERVICE_ROLE_KEY="production-test-key-not-valid-in-real-supabase";
});
test.afterEach(()=>{
 globalThis.fetch=originalFetch;
 setPlatformSupabaseFactoryForTests(null);
 for(const [k,v] of Object.entries(original))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test("Altovena preview RPC goes to its own staging URL/key and never platform connection",async()=>{
 let calls=0;
 setPlatformSupabaseFactoryForTests(()=>{
  throw Error("preview Altovena must NEVER call getPlatformSupabase");
 });
 globalThis.fetch=(async(input:RequestInfo|URL,options?:RequestInit)=>{
  calls++;
  assert.equal(String(input),`https://${stage}.supabase.co/rest/v1/rpc/altovena_intake_health`);
  const headers=new Headers(options?.headers);
  assert.equal(headers.get("apikey"),process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY);
  assert.notEqual(headers.get("apikey"),process.env.SUPABASE_SERVICE_ROLE_KEY);
  return new Response(JSON.stringify({schema_version:"synthetic"}),{
   status:200,headers:{"Content-Type":"application/json"},
  });
 }) as typeof fetch;
 const client=getAltovenaSupabase();
 assert.ok(client);
 const {data,error}=await client.rpc("altovena_intake_health");
 assert.equal(error,null);
 assert.deepEqual(data,{schema_version:"synthetic"});
 assert.equal(calls,1);
});
test("missing separate staging credentials never falls back to production platform client",()=>{
 setPlatformSupabaseFactoryForTests(()=>{
  throw Error("shared Supabase fallback forbidden for Altovena preview");
 });
 for(const key of ["ALTOVENA_STAGING_SUPABASE_URL",
   "ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
   "ALTOVENA_STAGING_SUPABASE_PROJECT_REF",
   "ALTOVENA_STAGING_ISOLATION_ENABLED"]){
  const saved=process.env[key];
  delete process.env[key];
  assert.equal(getAltovenaSupabase(),null,key);
  process.env[key]=saved;
 }
});
test("production continues to use exactly the existing platform Supabase factory",()=>{
 process.env.VERCEL_ENV="production";
 const fake={tag:"platform-factory"} as unknown as SupabaseClient;
 setPlatformSupabaseFactoryForTests(()=>fake);
 assert.equal(getAltovenaSupabase(),fake);
 assert.equal(getPlatformSupabase(),fake);
});


test("mismatched or production staging URL refuses a client without calling platform or network",()=>{
 let networkCalls=0;
 globalThis.fetch=(async()=>{networkCalls++;throw Error("No network expected");}) as typeof fetch;
 setPlatformSupabaseFactoryForTests(()=>{
  throw Error("No production fallback allowed");
 });
 for(const [ref,url] of [
  [production,`https://${production}.supabase.co`],
  [stage,`https://${production}.supabase.co`],
  [stage,`http://${stage}.supabase.co`],
  [stage,`https://${stage}.supabase.co.evil.example`],
  [stage,`https://${stage}.supabase.co/rest/v1`],
  [stage,`https://${stage}.supabase.co:8443/`],
  [stage,`https://${stage}.supabase.co/?key=leak`],
 ]) {
  process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=ref;
  process.env.ALTOVENA_STAGING_SUPABASE_URL=url;
  assert.equal(getAltovenaSupabase(),null,`must reject ${url}`);
 }
 assert.equal(networkCalls,0);
});
