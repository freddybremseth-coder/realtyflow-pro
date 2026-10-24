import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminSession, createWorkspacePreviewSession, WORKSPACE_PREVIEW_COOKIE,
} from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET, POST } from "../../src/app/api/workspaces/altovena/operator-alerts/route";

const endpoint="https://realtyflow.test/api/workspaces/altovena/operator-alerts";
const brandId="11111111-1111-4111-8111-111111111111";
const staffId="22222222-2222-4222-8222-222222222222";
const alertId="33333333-3333-4333-8333-333333333333";
const contactId="44444444-4444-4444-8444-444444444444";
let grantStatus="active";
let permissions=["crm.read"];
let authOk=true;
let readKeys:string[]=[];
let ackKeys:string[]=[];
let returnBadBrand=false;
let rpcFailure=false;
const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
 "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED","NEXT_PUBLIC_SUPABASE_URL",
 "SUPABASE_SERVICE_ROLE_KEY","ALTOVENA_ALERT_INBOX_ENABLED",
 "ALTOVENA_ALERT_RECEIPT_HMAC_KEY"];
let before:Record<string,string|undefined>={};

const make=(cookie="",method:"GET"|"POST"="GET",body?:unknown,headers:Record<string,string>={})=>
 new NextRequest(endpoint,{
  method,headers:{
   ...(cookie?{cookie}:{}),
   ...(method==="POST"?{"Content-Type":"application/json",origin:"https://realtyflow.test"}:{}),
   ...headers,
  },
  ...(body===undefined?{}:{body:JSON.stringify(body)}),
 });
async function ownerCookie(){return "realtyflow_admin="+await createAdminSession("owner@example.invalid");}
async function memberCookie(){return "realtyflow_admin="+await createAdminSession("staff@example.invalid","WORKSPACE_MEMBER");}

test.beforeEach(()=>{
 before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.REALTYFLOW_SESSION_SECRET="local-fake-session-secret-for-isolated-tests";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://operator-inbox-test.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="test-only-no-real-secret";
 process.env.ALTOVENA_ALERT_INBOX_ENABLED="true";
 process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY="isolated-hmac-test-key-never-used-in-production-2026";
 grantStatus="active";permissions=["crm.read"];authOk=true;
 readKeys=[];ackKeys=[];returnBadBrand=false;rpcFailure=false;
 setPlatformSupabaseFactoryForTests(()=>({
  rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==="workspace_brand_grant")return {data:{
     brand:{id:brandId,brand_key:"altovena"},
     grant:{brand_id:brandId,user_id:staffId,email:"staff@example.invalid",
       status:grantStatus,permissions},
   },error:null};
   if(rpcFailure)return {data:null,error:{message:"Unavailable"}};
   if(name==="altovena_operator_alert_inbox"){
     readKeys.push(String(args.p_operator_key));
     return {data:{
       ok:true,brand:returnBadBrand?"zeneco":"altovena",
       alerts:[{id:alertId,kind:"NOT_STARTED_24H",createdAt:"2026-10-17T10:00:00Z",
         contactId,readAt:null}],
       totalPending:1,unreadTotal:1,emailSent:false,externalDelivery:false,
     },error:null};
   }
   if(name==="altovena_ack_operator_alert"){
     ackKeys.push(String(args.p_operator_key));
     return {data:{
       ok:true,brand:returnBadBrand?"zeneco":"altovena",id:args.p_alert_id,
       readAt:"2026-10-18T01:01:00Z",emailSent:false,externalDelivery:false,
     },error:null};
   }
   throw Error("Unexpected RPC "+name);
  },
  auth:{admin:{getUserById:async()=>({data:authOk?
    {user:{id:staffId,email:"staff@example.invalid"}}:{user:null},error:null})}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 for(const [key,value] of Object.entries(before))
   if(value===undefined)delete process.env[key];else process.env[key]=value;
});

test("unsigned, revoked, unverified or non-reader staff never access inbox",async()=>{
 assert.equal((await GET(make())).status,401);
 for(const fault of ["revoked","unverified","no_read"]){
   grantStatus=fault==="revoked"?"revoked":"active";
   authOk=fault!=="unverified";
   permissions=fault==="no_read"?["crm.write"]:["crm.read"];
   assert.equal((await GET(make(await memberCookie()))).status,403,fault);
 }
 assert.equal(readKeys.length,0);
});
test("real owner and independently verified employee see same alerts, different private receipt keys",async()=>{
 const owner=await GET(make(await ownerCookie()));
 const member=await GET(make(await memberCookie()));
 assert.equal(owner.status,200);
 assert.equal(member.status,200);
 const o=await owner.json(),m=await member.json();
 assert.deepEqual(o,m);
 assert.equal(o.enabled,true);
 assert.equal(o.unreadTotal,1);
 assert.equal(o.alerts[0].contactId,contactId);
 assert.equal(o.externalDelivery,false);
 assert.equal(owner.headers.get("cache-control"),"private, no-store");
 assert.equal(readKeys.length,2);
 assert.match(readKeys[0],/^[a-f0-9]{64}$/);
 assert.match(readKeys[1],/^[a-f0-9]{64}$/);
 assert.notEqual(readKeys[0],readKeys[1]);
 assert.equal(JSON.stringify(readKeys).includes("@"),false);
});
test("owner preview cannot read or acknowledge another operator's private receipts",async()=>{
 const owner=await ownerCookie();
 const preview=await createWorkspacePreviewSession(
   "owner@example.invalid","staff@example.invalid","Staff");
 const value=owner+"; "+WORKSPACE_PREVIEW_COOKIE+"="+preview;
 assert.equal((await GET(make(value))).status,403);
 assert.equal((await POST(make(value,"POST",{id:alertId}))).status,403);
 assert.equal(readKeys.length,0);
 assert.equal(ackKeys.length,0);
});
test("ack is explicit same-origin, one UUID, in current operator namespace only",async()=>{
 const member=await memberCookie();
 for(const [body,headers,status] of [
   [{id:alertId},{origin:"https://untrusted.invalid"},403],
   [{id:alertId},{"sec-fetch-site":"cross-site"},403],
   [{id:"wrong"}, {},400],
   [{id:alertId,operator:"owner"}, {},400],
 ] as const){
   assert.equal((await POST(make(member,"POST",body,headers))).status,status);
 }
 assert.equal(ackKeys.length,0);
 const ok=await POST(make(member,"POST",{id:alertId}));
 assert.equal(ok.status,200);
 assert.equal((await ok.json()).id,alertId);
 assert.equal(ackKeys.length,1);
 assert.equal(ackKeys[0].includes("@"),false);
 const other=await POST(make(await ownerCookie(),"POST",{id:alertId}));
 assert.equal(other.status,200);
 assert.notEqual(ackKeys[0],ackKeys[1]);
});
test("disabled feature and missing HMAC key cannot mutate/read active alerts",async()=>{
 delete process.env.ALTOVENA_ALERT_INBOX_ENABLED;
 delete process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
 const off=await GET(make(await ownerCookie()));
 assert.equal(off.status,200);
 assert.equal((await off.json()).enabled,false);
 assert.equal((await POST(make(await ownerCookie(),"POST",{id:alertId}))).status,403);
 assert.equal(readKeys.length,0);assert.equal(ackKeys.length,0);
 process.env.ALTOVENA_ALERT_INBOX_ENABLED="true";
 assert.equal((await GET(make(await ownerCookie()))).status,503);
 assert.equal(readKeys.length,0);
});
test("wrong brand or RPC error fails closed, never returns guessed data",async()=>{
 returnBadBrand=true;
 assert.equal((await GET(make(await ownerCookie()))).status,503);
 assert.equal((await POST(make(await ownerCookie(),"POST",{id:alertId}))).status,404);
 returnBadBrand=false;rpcFailure=true;
 assert.equal((await GET(make(await ownerCookie()))).status,503);
 assert.equal((await POST(make(await ownerCookie(),"POST",{id:alertId}))).status,503);
});
