import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {consumeAltovenaStagingLoginBudget} from "../../src/lib/altovena/staging-login-limit";
import {setAltovenaPreviewClientFactoryForTests} from "../../src/lib/altovena/supabase";
const ref="abcdefghijklmnopqrst",production="ereapsfcsqtdmzosgnnn";
const vars=["VERCEL_ENV","ALTOVENA_STAGING_ISOLATION_ENABLED","ALTOVENA_STAGING_SUPABASE_PROJECT_REF",
"ALTOVENA_STAGING_SUPABASE_URL","ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY",
"ALTOVENA_STAGING_LOGIN_LIMIT_HMAC_KEY","ALTOVENA_STAGING_SESSION_SECRET"];
let saved:Record<string,string|undefined>={},calls:Array<Record<string,unknown>>=[];
let blocked=false,error=false;
test.beforeEach(()=>{
 saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 process.env.VERCEL_ENV="preview";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=ref;
 process.env.ALTOVENA_STAGING_SUPABASE_URL=`https://${ref}.supabase.co`;
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-unique-staging-test-key";
 process.env.ALTOVENA_STAGING_SESSION_SECRET="isolated-session-test-key-not-reused-for-limiter-2026";
 process.env.ALTOVENA_STAGING_LOGIN_LIMIT_HMAC_KEY="isolated-login-limit-hmac-key-not-reused-with-session-2026";
 calls=[];blocked=false;error=false;
 setAltovenaPreviewClientFactoryForTests(()=>({
  rpc:async(name:string,args:Record<string,unknown>)=>{
   assert.equal(name,"altovena_consume_login_limit");calls.push(args);
   return {data:!blocked,error:error?{message:"offline"}:null};
  },
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setAltovenaPreviewClientFactoryForTests(null);
 for(const [k,v] of Object.entries(saved))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test("server-side global and account budgets use independent HMAC keys",async()=>{
 assert.equal(await consumeAltovenaStagingLoginBudget(" Staff@Example.invalid "),true);
 assert.deepEqual(calls.map(c=>[c.p_limit,c.p_window_seconds]),[[300,900],[5,900]]);
 assert.match(String(calls[0].p_identifier),/^[a-f0-9]{64}$/);
 assert.match(String(calls[1].p_identifier),/^[a-f0-9]{64}$/);
 assert.notEqual(calls[0].p_identifier,calls[1].p_identifier);
 assert.equal(JSON.stringify(calls).includes("Staff@"),false);
});
test("rejected budget, RPC error, missing key or production env cannot authenticate",async()=>{
 blocked=true;assert.equal(await consumeAltovenaStagingLoginBudget("staff@example.invalid"),false);
 blocked=false;error=true;assert.equal(await consumeAltovenaStagingLoginBudget("staff@example.invalid"),false);
 error=false;delete process.env.ALTOVENA_STAGING_LOGIN_LIMIT_HMAC_KEY;
 assert.equal(await consumeAltovenaStagingLoginBudget("staff@example.invalid"),false);
 process.env.ALTOVENA_STAGING_LOGIN_LIMIT_HMAC_KEY="isolated-login-limit-hmac-key-not-reused-with-session-2026";
 process.env.VERCEL_ENV="production";
 assert.equal(await consumeAltovenaStagingLoginBudget("staff@example.invalid"),false);
});
