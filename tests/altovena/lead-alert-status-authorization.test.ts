import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSession } from "@/lib/admin-auth";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "../../src/app/api/workspaces/altovena/lead-alert-status/route";

const endpoint="https://realtyflow.test/api/workspaces/altovena/lead-alert-status";
const brandId="11111111-1111-4111-8111-111111111111";
const operatorId="22222222-2222-4222-8222-222222222222";
let active=true;
let permissions=["crm.read"];
let row:any={brand_key:"altovena",last_scan_at:new Date().toISOString(),pending_count:3};
let queryError:unknown=null;
const calls:string[]=[];
const keys=[
  "REALTYFLOW_SESSION_SECRET","REALTYFLOW_ADMIN_EMAILS",
  "REALTYFLOW_WORKSPACE_MEMBERS_ENABLED","NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY","ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
];
let snapshot:Record<string,string|undefined>={};
async function cookie(role:"OWNER"|"WORKSPACE_MEMBER"){
 const email=role==="OWNER"?"owner@example.invalid":"staff@example.invalid";
 return "realtyflow_admin="+await createAdminSession(email,role);
}
const request=(value="")=>new NextRequest(endpoint,{headers:value?{cookie:value}:{}});

test.beforeEach(()=>{
 snapshot=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.REALTYFLOW_SESSION_SECRET="synthetic-alert-status-test-only";
 process.env.REALTYFLOW_ADMIN_EMAILS="owner@example.invalid";
 process.env.REALTYFLOW_WORKSPACE_MEMBERS_ENABLED="true";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://isolated-alert-status.invalid";
 process.env.SUPABASE_SERVICE_ROLE_KEY="test-only-fake";
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 active=true;permissions=["crm.read"];queryError=null;
 row={brand_key:"altovena",last_scan_at:new Date().toISOString(),pending_count:3};
 calls.length=0;
 const chain:any={
  select(value:string){calls.push("select:"+value);return chain;},
  eq(key:string,val:string){calls.push("eq:"+key+":"+val);return chain;},
  maybeSingle:async()=>({data:row,error:queryError}),
 };
 setPlatformSupabaseFactoryForTests(()=>({
  rpc:async(name:string)=>{
   if(name!=="workspace_brand_grant")throw Error("unexpected RPC");
   return {data:{
     brand:{id:brandId,brand_key:"altovena"},
     grant:{brand_id:brandId,user_id:operatorId,email:"staff@example.invalid",
       status:active?"active":"revoked",permissions},
   },error:null};
  },
  from:(table:string)=>{
   calls.push("from:"+table);
   if(table!=="altovena_alert_scan_state")throw Error("unexpected table");
   return chain;
  },
  auth:{admin:{getUserById:async()=>
   ({data:{user:{id:operatorId,email:"staff@example.invalid"}},error:null})}},
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 for(const [key,val] of Object.entries(snapshot))
  if(val===undefined)delete process.env[key];else process.env[key]=val;
});

test("unsigned access and revoked worker grant cannot see operational alert counts",async()=>{
 assert.equal((await GET(request())).status,401);
 active=false;
 assert.equal((await GET(request(await cookie("WORKSPACE_MEMBER")))).status,403);
 assert.equal(calls.includes("from:altovena_alert_scan_state"),false);
});
test("owner and verified worker see same non-sensitive recent scan heartbeat",async()=>{
 for(const role of ["OWNER","WORKSPACE_MEMBER"] as const){
   const result=await GET(request(await cookie(role)));
   assert.equal(result.status,200);
   const body=await result.json();
   assert.deepEqual(Object.keys(body).sort(),[
    "brand","deliveryEnabled","lastScanAt","ok","pending","state",
   ].sort());
   assert.equal(body.brand,"altovena");
   assert.equal(body.state,"recent");
   assert.equal(body.pending,3);
   assert.equal(body.deliveryEnabled,false);
   assert.equal(result.headers.get("cache-control"),"private, no-store");
 }
 assert.ok(calls.includes("eq:brand_key:altovena"));
 assert.ok(calls.some(x=>x==="select:brand_key,last_scan_at,pending_count"));
 assert.equal(JSON.stringify(calls).includes("contacts"),false);
});
test("disabled scanner never appears healthy, even if it was previously running",async()=>{
 delete process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED;
 const result=await GET(request(await cookie("OWNER")));
 assert.deepEqual(await result.json(),{
  ok:true,brand:"altovena",state:"disabled",
  lastScanAt:null,pending:0,deliveryEnabled:false,
 });
 assert.equal(calls.includes("from:altovena_alert_scan_state"),false);
});
test("no scan, delayed scan, missing database and invalid evidence all fail visibly",async()=>{
 row=null;
 let result=await GET(request(await cookie("OWNER")));
 assert.equal((await result.json()).state,"no_scan");
 row={brand_key:"altovena",last_scan_at:"2026-10-01T00:00:00.000Z",pending_count:1};
 result=await GET(request(await cookie("OWNER")));
 assert.equal((await result.json()).state,"stale");
 row={brand_key:"zeneco",last_scan_at:new Date().toISOString(),pending_count:100};
 result=await GET(request(await cookie("OWNER")));
 assert.equal(result.status,503);
 row={brand_key:"altovena",last_scan_at:new Date().toISOString(),pending_count:3};
 queryError={message:"unavailable"};
 assert.equal((await GET(request(await cookie("OWNER")))).status,503);
});
