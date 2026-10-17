import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { setPlatformSupabaseFactoryForTests } from "@/lib/platform/supabase";
import { GET } from "../../src/app/api/cron/altovena-lead-alerts/route";

const path="/api/cron/altovena-lead-alerts";
const secret="offline-synthetic-secret-not-for-production";
const envKeys=[
  "CRON_SECRET","ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
  "CRON_SAFE_MODE","CRON_SAFE_MODE_DISABLE_HEALTHCHECK",
  "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SAFE_MODE_ALLOW_PATHS",
] as const;
let previous:Record<string,string|undefined>={};
let rpcCalls=0;
let rpcResult:unknown={ok:true,brand:"altovena",queued:2,resolved:1,pending:4,deliveryEnabled:false};
let rpcError:unknown=null;
function request(headers:Record<string,string>={},query=""){
 return new NextRequest("https://realtyflow.test"+path+query,{headers});
}
test.beforeEach(()=>{
 previous=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 for(const key of envKeys) delete process.env[key];
 rpcCalls=0;rpcError=null;
 rpcResult={ok:true,brand:"altovena",queued:2,resolved:1,pending:4,deliveryEnabled:false};
 process.env.CRON_SECRET=secret;
 process.env.CRON_SAFE_MODE_DISABLE_HEALTHCHECK="true";
 setPlatformSupabaseFactoryForTests(()=>({
   rpc:async(name:string)=>{
     rpcCalls++;
     assert.equal(name,"altovena_reconcile_lead_alerts");
     return {data:rpcResult,error:rpcError};
   },
 } as unknown as SupabaseClient));
});
test.afterEach(()=>{
 setPlatformSupabaseFactoryForTests(null);
 for(const [key,value] of Object.entries(previous))
   if(value===undefined)delete process.env[key]; else process.env[key]=value;
});

test("a missing cron secret fails closed before any DB call",async()=>{
 delete process.env.CRON_SECRET;
 const result=await GET(request());
 assert.equal(result.status,503);
 assert.equal(rpcCalls,0);
});

test("query credentials, header key, and incorrect bearer cannot run the scanner",async()=>{
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 const requests=[
   request({}, "?key="+secret),
   request({"x-cron-secret":secret}),
   request({authorization:"Bearer wrong"}),
 ];
 for(const req of requests){
   const result=await GET(req);
   assert.equal(result.status,401);
 }
 assert.equal(rpcCalls,0);
});

test("with correct credentials the opt-in scanner remains off by default",async()=>{
 const result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).skipped,true);
 assert.equal(rpcCalls,0);
});

test("emergency safe mode wins over enabled scanner",async()=>{
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 process.env.CRON_SAFE_MODE="true";
 const result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).skipped,true);
 assert.equal(rpcCalls,0);
});

test("verified scheduled call returns counts without notifying or accessing customer details",async()=>{
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 const result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal(result.status,200);
 const body=await result.json();
 assert.deepEqual(body,{
   ok:true,brand:"altovena",queued:2,resolved:1,pending:4,
   deliveryEnabled:false,emailSent:false,
 });
 assert.equal(rpcCalls,1);
 assert.equal(JSON.stringify(body).includes("@"),false);
});

test("database failures or a bogus result never claim successful alerting",async()=>{
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 for(const invalid of [
   {ok:true,brand:"zeneco",queued:1,resolved:0,pending:1,deliveryEnabled:false},
   {ok:true,brand:"altovena",queued:1,resolved:0,pending:1,deliveryEnabled:true},
   {ok:true,brand:"altovena",queued:-1,resolved:0,pending:1,deliveryEnabled:false},
   {ok:true,brand:"altovena",queued:null,resolved:0,pending:1,deliveryEnabled:false},
 ]){
   rpcResult=invalid;
   const result=await GET(request({authorization:"Bearer "+secret}));
   assert.equal(result.status,503);
 }
 rpcError={message:"unavailable"};
 assert.equal((await GET(request({authorization:"Bearer "+secret}))).status,503);
});
