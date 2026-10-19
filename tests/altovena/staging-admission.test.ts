import assert from "node:assert/strict";
import test from "node:test";
import type {SupabaseClient} from "@supabase/supabase-js";
import {admitAltovenaStagingUser} from "../../src/lib/altovena/staging-admission";
const ref="abcdefghijklmnopqrst",id="22222222-2222-4222-8222-222222222222";
const email="operator@example.invalid",brand="11111111-1111-4111-8111-111111111111";
const keys=["VERCEL_ENV","ALTOVENA_STAGING_ISOLATION_ENABLED",
 "ALTOVENA_STAGING_SUPABASE_PROJECT_REF","ALTOVENA_STAGING_SUPABASE_URL",
 "ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY"];
let saved:Record<string,string|undefined>={};
let status="active",permissions=["crm.read"],authEmail=email,grantEmail=email,stageBrand="altovena";
let authAttempts=0,rpcCalls=0;
const deps=()=>({
 authenticate:async(e:string,password:string)=>{
  authAttempts++;assert.equal(e,email);assert.equal(password,"synthetic-pass");
  return {user:{id,email:authEmail},error:false};
 },
 stagingDb:{
  rpc:async(name:string,args:Record<string,unknown>)=>{
   rpcCalls++;assert.equal(name,"workspace_brand_grant");
   assert.equal(args.p_email,email);
   return {data:{brand:{id:brand,brand_key:stageBrand},
    grant:{brand_id:brand,user_id:id,email:grantEmail,status,permissions}},error:null};
  },
  auth:{admin:{getUserById:async()=>({data:{user:{id,email}},error:null})}},
 } as unknown as Pick<SupabaseClient,"rpc"|"auth">,
});
test.beforeEach(()=>{
 saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 status="active";permissions=["crm.read"];authEmail=email;grantEmail=email;stageBrand="altovena";
 authAttempts=0;rpcCalls=0;
 process.env.VERCEL_ENV="preview";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF=ref;
 process.env.ALTOVENA_STAGING_SUPABASE_URL=`https://${ref}.supabase.co`;
 process.env.ALTOVENA_STAGING_SUPABASE_SERVICE_ROLE_KEY="synthetic-only";
});
test.afterEach(()=>{
 for(const [key,val] of Object.entries(saved))
  if(val===undefined)delete process.env[key];else process.env[key]=val;
});
test("valid staging Supabase Auth + active Altovena grant admits CRM reader",async()=>{
 assert.deepEqual(await admitAltovenaStagingUser(email,"synthetic-pass",deps()),
  {ok:true,identity:{id,email}});
 assert.equal(authAttempts,1);assert.equal(rpcCalls,1);
});
test("revoked, wrong-brand and missing CRM grant cannot be admitted",async()=>{
 for(const state of ["revoked","wrong-brand","missing-crm","mismatch-email"]){
  status=state==="revoked"?"revoked":"active";
  stageBrand=state==="wrong-brand"?"zeneco":"altovena";
  permissions=state==="missing-crm"?["marketing.read"]:["crm.read"];
  grantEmail=state==="mismatch-email"?"wrong@example.invalid":email;
  const r=await admitAltovenaStagingUser(email,"synthetic-pass",deps());
  assert.equal(r.ok,false,state);
 }
});
test("Supabase Auth identity mismatch cannot pass through to staging grant",async()=>{
 authEmail="someone-else@example.invalid";
 assert.deepEqual(await admitAltovenaStagingUser(email,"synthetic-pass",deps()),
 {ok:false,reason:"AUTH_REJECTED"});
 assert.equal(rpcCalls,0);
});
test("production, missing isolated endpoint and invalid credentials stop before Auth",async()=>{
 for(const change of ["production","disabled"]){
  if(change==="production")process.env.VERCEL_ENV="production";
  else{process.env.VERCEL_ENV="preview";delete process.env.ALTOVENA_STAGING_SUPABASE_URL;}
  const r=await admitAltovenaStagingUser(email,"synthetic-pass",deps());
  assert.deepEqual(r,{ok:false,reason:"STAGING_DISABLED"});
 }
 assert.equal(authAttempts,0);assert.equal(rpcCalls,0);
});
