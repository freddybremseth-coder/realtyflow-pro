import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "../../src/app/api/cron/altovena-delivery-preflight/route";

const endpoint="https://realtyflow.test/api/cron/altovena-delivery-preflight";
const secret="isolated-super-secret-not-for-production";
const keys=["CRON_SECRET","ALTOVENA_DELIVERY_PREFLIGHT_ENABLED",
 "ALTOVENA_LEAD_ALERT_SCAN_ENABLED"];
let old:Record<string,string|undefined>={};
const request=(headers:Record<string,string>={},query="")=>
  new NextRequest(endpoint+query,{headers});

test.beforeEach(()=>{
 old=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 process.env.CRON_SECRET=secret;
 delete process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED;
 delete process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED;
});
test.afterEach(()=>{
 for(const [key,val] of Object.entries(old))
  if(val===undefined)delete process.env[key];else process.env[key]=val;
});
test("missing or weak cron credential fails before a Supabase RPC",async()=>{
 delete process.env.CRON_SECRET;
 assert.equal((await GET(request())).status,503);
 process.env.CRON_SECRET="short";
 assert.equal((await GET(request({authorization:"Bearer short"}))).status,503);
});
test("query key, header secret and invalid bearer cannot prepare deliveries",async()=>{
 for(const req of [
  request({}, "?key="+secret),
  request({"x-cron-secret":secret}),
  request({authorization:"Bearer fake"}),
  request({authorization:"Basic "+secret}),
 ]){
  const result=await GET(req);
  assert.equal(result.status,401);
  assert.equal((await result.json()).error,"UNAUTHORIZED");
 }
});
test("missing either opt-in flag is safe and never accesses recipient identity",async()=>{
 let result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal(result.status,200);
 assert.equal((await result.json()).emailSent,false);
 process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED="true";
 result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal((await result.json()).skipped,true);
 delete process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED;
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal((await result.json()).deliveryAttempted,false);
});
