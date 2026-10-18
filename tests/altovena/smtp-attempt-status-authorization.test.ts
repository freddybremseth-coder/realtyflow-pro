import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createAdminSession,createWorkspacePreviewSession,WORKSPACE_PREVIEW_COOKIE} from
  "@/lib/admin-auth";
import {setPlatformSupabaseFactoryForTests} from "@/lib/platform/supabase";
import {GET} from "../../src/app/api/workspaces/altovena/smtp-attempt-status/route";

const url="https://realtyflow.test/api/workspaces/altovena/smtp-attempt-status";
const brand="11111111-1111-4111-8111-111111111111";
const userId="22222222-2222-4222-8222-222222222222";
const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
"REALTYFLOW_WORKSPACE_MEMBERS_ENABLED","NEXT_PUBLIC_SUPABASE_URL",
"SUPABASE_SERVICE_ROLE_KEY","VERCEL_ENV","ALTOVENA_EMAIL_STAGING_SEND_ENABLED",
"ALTOVENA_ALERT_RECEIPT_HMAC_KEY"];
let original:Record<string,string|undefined>={};
let grantStatus="active",rpcError=false,rpcBrand="altovena";
const lookups:string[]=[];
const request=(cookie="")=>new NextRequest(url,{headers:cookie?{cookie}:{}});
const session=async(role:"OWNER"|"WORKSPACE_MEMBER")=>
 "realtyflow_admin="+await createAdminSession(
  role==="OWNER"?"owner@example.invalid":"staff@example.invalid",role
 );
test.beforeEach(()=>{
 original=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.REALTYFLOW_SESSION_SECRET="isolated-smtp-status-auth-test-session-key";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://local-test.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="fake-key";
 process.env.VERCEL_ENV="preview";
 process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED="true";
 process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY="isolated-smtp-status-hmac-key-for-tests";
 grantStatus="active";rpcError=false;rpcBrand="altovena";lookups.length=0;
 setPlatformSupabaseFactoryForTests(()=>({
  rpc:async(name:string,args:Record<string,unknown>)=>{
    lookups.push(name);
    if(name==="workspace_brand_grant")return {data:{
      brand:{id:brand,brand_key:"altovena"},
      grant:{brand_id:brand,user_id:userId,email:"staff@example.invalid",
       status:grantStatus,permissions:["crm.read"]},
    },error:null};
    if(name==="altovena_operator_smtp_status")return rpcError?
      {data:null,error:{message:"database unavailable"}}:
      {data:{ok:true,brand:rpcBrand,attempting:1,smtpAccepted:2,
        outcomeUnknown:3,deliveryConfirmed:false},error:null};
    throw Error("Unexpected RPC");
  },
  auth:{admin:{getUserById:async()=>({
    data:{user:{id:userId,email:"staff@example.invalid"}},error:null,
  })}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 for(const [key,value] of Object.entries(original))
  if(value===undefined)delete process.env[key];else process.env[key]=value;
});
test("unsigned, revoked and owner-preview sessions cannot see private SMTP status",async()=>{
 assert.equal((await GET(request())).status,401);
 grantStatus="revoked";
 assert.equal((await GET(request(await session("WORKSPACE_MEMBER")))).status,403);
 grantStatus="active";
 const owner=await session("OWNER");
 const preview=await createWorkspacePreviewSession(
   "owner@example.invalid","staff@example.invalid","Employee");
 assert.equal((await GET(request(owner+"; "+
   WORKSPACE_PREVIEW_COOKIE+"="+preview))).status,403);
 assert.equal(lookups.includes("altovena_operator_smtp_status"),false);
});
test("active owner and verified staff get separate HMAC-scoped counts, not recipient data",async()=>{
 for(const role of ["OWNER","WORKSPACE_MEMBER"] as const){
  const r=await GET(request(await session(role)));
  assert.equal(r.status,200);
  assert.deepEqual(await r.json(),{ok:true,brand:"altovena",state:"staging",
    attempting:1,smtpAccepted:2,outcomeUnknown:3,deliveryConfirmed:false});
  assert.equal(r.headers.get("cache-control"),"private, no-store");
 }
 assert.equal(lookups.filter(n=>n==="altovena_operator_smtp_status").length,2);
});
test("production always reports staging dispatch disabled",async()=>{
 process.env.VERCEL_ENV="production";
 const r=await GET(request(await session("OWNER")));
 assert.deepEqual(await r.json(),{ok:true,brand:"altovena",state:"disabled",
  attempting:0,smtpAccepted:0,outcomeUnknown:0,deliveryConfirmed:false});
 assert.equal(lookups.includes("altovena_operator_smtp_status"),false);
});
test("wrong-brand RPC or database failure refuses invented success",async()=>{
 rpcBrand="zeneco";
 assert.equal((await GET(request(await session("OWNER")))).status,503);
 rpcBrand="altovena";rpcError=true;
 assert.equal((await GET(request(await session("OWNER")))).status,503);
});
