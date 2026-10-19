import assert from "node:assert/strict";
import test from "node:test";
import {assessAltovenaDatabaseIsolation} from
  "../../src/lib/altovena/preview-database-isolation";

const preview="abcdefghijklmnopqrst";
const prod="ereapsfcsqtdmzosgnnn";
const good={
 VERCEL_ENV:"preview",
 NODE_ENV:"production",
 ALTOVENA_STAGING_ISOLATION_ENABLED:"true",
 ALTOVENA_STAGING_SUPABASE_PROJECT_REF:preview,
 NEXT_PUBLIC_SUPABASE_URL:`https://${preview}.supabase.co`,
 SUPABASE_SERVICE_ROLE_KEY:"synthetic-only-do-not-use-in-production",
};
test("preview is blocked by default even if a production Supabase key exists",()=>{
 const r=assessAltovenaDatabaseIsolation({
  ...good,ALTOVENA_STAGING_ISOLATION_ENABLED:undefined,
 });
 assert.deepEqual(r,{allowed:false,state:"blocked",reason:"STAGING_DISABLED"});
});
test("the confirmed RealtyflowPRO production project is forbidden as staging",()=>{
 const r=assessAltovenaDatabaseIsolation({
  ...good,ALTOVENA_STAGING_SUPABASE_PROJECT_REF:prod,
  NEXT_PUBLIC_SUPABASE_URL:`https://${prod}.supabase.co`,
 });
 assert.deepEqual(r,{allowed:false,state:"blocked",reason:"PRODUCTION_PROJECT_FORBIDDEN"});
});
test("a matching explicit nonproduction staging reference is allowed",()=>{
 const r=assessAltovenaDatabaseIsolation(good);
 assert.deepEqual(r,{allowed:true,state:"isolated_preview",reason:"STAGING_BINDING_VERIFIED"});
});
test("different project URL, insecure or custom URL, missing server key all fail closed",()=>{
 const inputs=[
  {...good,NEXT_PUBLIC_SUPABASE_URL:`https://${prod}.supabase.co`},
  {...good,NEXT_PUBLIC_SUPABASE_URL:`http://${preview}.supabase.co`},
  {...good,NEXT_PUBLIC_SUPABASE_URL:`https://${preview}.supabase.co/path`},
  {...good,NEXT_PUBLIC_SUPABASE_URL:`https://${preview}.supabase.co?x=1`},
  {...good,NEXT_PUBLIC_SUPABASE_URL:`https://user:pass@${preview}.supabase.co`},
  {...good,NEXT_PUBLIC_SUPABASE_URL:"https://unverified-custom-domain.example"},
  {...good,SUPABASE_SERVICE_ROLE_KEY:undefined},
  {...good,ALTOVENA_STAGING_SUPABASE_PROJECT_REF:"invalid ref"},
 ];
 for(const input of inputs){
  const actual=assessAltovenaDatabaseIsolation(input);
  assert.equal(actual.allowed,false,JSON.stringify({
   projectRef:input.ALTOVENA_STAGING_SUPABASE_PROJECT_REF,
   url:input.NEXT_PUBLIC_SUPABASE_URL,
  }));
 }
});
test("preview with all flags enabled still cannot use shared production database",()=>{
 const env={...good,ALTOVENA_STAGING_SUPABASE_PROJECT_REF:preview,
 NEXT_PUBLIC_SUPABASE_URL:`https://${prod}.supabase.co`};
 assert.equal(assessAltovenaDatabaseIsolation(env).allowed,false);
});
test("production runtime is unchanged and test-only process remains executable",()=>{
 assert.equal(assessAltovenaDatabaseIsolation({...good,VERCEL_ENV:"production"}).allowed,true);
 assert.equal(assessAltovenaDatabaseIsolation({
  ...good,VERCEL_ENV:undefined,NODE_ENV:"test",
 }).state,"test");
});
