import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import type {SupabaseClient} from "@supabase/supabase-js";
import {createAdminSession,createWorkspacePreviewSession,
 WORKSPACE_PREVIEW_COOKIE} from "@/lib/admin-auth";
import {setPlatformSupabaseFactoryForTests} from "@/lib/platform/supabase";
import {GET} from "../../src/app/api/workspaces/altovena/delivery-preflight-status/route";

const brandId="11111111-1111-4111-8111-111111111111";
const userId="22222222-2222-4222-8222-222222222222";
const url="https://realtyflow.test/api/workspaces/altovena/delivery-preflight-status";
const keys=["REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
"REALTYFLOW_WORKSPACE_MEMBERS_ENABLED","NEXT_PUBLIC_SUPABASE_URL",
"SUPABASE_SERVICE_ROLE_KEY","ALTOVENA_DELIVERY_PREFLIGHT_ENABLED",
"ALTOVENA_ALERT_RECEIPT_HMAC_KEY"];
let saved:Record<string,string|undefined>={};
let grantStatus="active",responseBrand="altovena";
let responseOk=true,rpcFail=false;
const receiptKeys:string[]=[];
let lookups=0;
async function cookie(role:"OWNER"|"WORKSPACE_MEMBER"){
 return "realtyflow_admin="+await createAdminSession(
  role==="OWNER"?"owner@example.invalid":"staff@example.invalid",role);
}
const request=(cookies="")=>new NextRequest(url,{headers:cookies?{cookie:cookies}:{}});
test.beforeEach(()=>{
 saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.REALTYFLOW_SESSION_SECRET="synthetic-only-delivery-preflight-session";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://nonexistent-test.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-only";
 process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED="true";
 process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY="dummy-key-for-local-test-only-2026-10-18";
 grantStatus="active";responseBrand="altovena";responseOk=true;
 rpcFail=false;receiptKeys.length=0;lookups=0;
 setPlatformSupabaseFactoryForTests(()=>({
  rpc:async(name:string,args:Record<string,unknown>)=>{
   if(name==="workspace_brand_grant"){
    lookups++;
    return {data:{brand:{id:brandId,brand_key:"altovena"},grant:{
      user_id:userId,brand_id:brandId,email:"staff@example.invalid",
      status:grantStatus,permissions:["crm.read"],
    }},error:null};
   }
   if(name==="altovena_operator_delivery_preflight"){
    receiptKeys.push(String(args.p_operator_key));
    return rpcFail?{data:null,error:{message:"no rows"}}:
      {data:{ok:responseOk,brand:responseBrand,
         prepared:3,cancelled:1,emailSent:false,deliveryAttempted:false},
       error:null};
   }
   throw Error("Unexpected RPC "+name);
  },
  auth:{admin:{getUserById:async()=>({
    data:{user:{id:userId,email:"staff@example.invalid"}},error:null,
  })}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 for(const [k,v] of Object.entries(saved))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test("unauthenticated and revoked staff cannot access prepared operator counts",async()=>{
 assert.equal((await GET(request())).status,401);
 grantStatus="revoked";
 assert.equal((await GET(request(await cookie("WORKSPACE_MEMBER")))).status,403);
 assert.equal(receiptKeys.length,0);
});
test("owner preview cannot impersonate staff prepared delivery candidates",async()=>{
 const owner=await cookie("OWNER");
 const preview=await createWorkspacePreviewSession(
  "owner@example.invalid","staff@example.invalid","Employee");
 assert.equal((await GET(request(owner+"; "+
  WORKSPACE_PREVIEW_COOKIE+"="+preview))).status,403);
 assert.equal(receiptKeys.length,0);
});
test("staff and owner see their own different keys and only aggregate counts",async()=>{
 const results=await Promise.all([
  GET(request(await cookie("OWNER"))),
  GET(request(await cookie("WORKSPACE_MEMBER"))),
 ]);
 for(const response of results){
  assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body,{ok:true,brand:"altovena",state:"prepared_only",
   prepared:3,cancelled:1,emailSent:false});
  assert.equal(response.headers.get("cache-control"),"private, no-store");
 }
 assert.equal(receiptKeys.length,2);
 assert.ok(receiptKeys.every(k=>/^[a-f\d]{64}$/.test(k)));
 assert.notEqual(receiptKeys[0],receiptKeys[1]);
 assert.equal(JSON.stringify(receiptKeys).includes("@"),false);
});
test("inert mode requires no HMAC key and makes no delivery-preflight RPC",async()=>{
 delete process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED;
 delete process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
 const res=await GET(request(await cookie("OWNER")));
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{
  ok:true,brand:"altovena",state:"disabled",prepared:0,cancelled:0,emailSent:false,
 });
 assert.equal(receiptKeys.length,0);
});
test("missing HMAC, other brand or RPC error never reports false prepared success",async()=>{
 delete process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY;
 assert.equal((await GET(request(await cookie("OWNER")))).status,503);
 process.env.ALTOVENA_ALERT_RECEIPT_HMAC_KEY="dummy-key-for-local-test-only-2026-10-18";
 responseBrand="zeneco";
 assert.equal((await GET(request(await cookie("OWNER")))).status,503);
 responseBrand="altovena";rpcFail=true;
 assert.equal((await GET(request(await cookie("OWNER")))).status,503);
});
