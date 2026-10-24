import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {GET} from "../../src/app/api/cron/altovena-smtp-staging/route";

const url="https://realtyflow.test/api/cron/altovena-smtp-staging";
const secret="offline-synthetic-cron-credential-only";
const keys=[
 "CRON_SECRET","VERCEL_ENV","ALTOVENA_EMAIL_STAGING_SEND_ENABLED",
 "ALTOVENA_DELIVERY_PREFLIGHT_ENABLED","ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
];
let snapshot:Record<string,string|undefined>={};
const request=(header:Record<string,string>={},query="")=>
 new NextRequest(url+query,{headers:header});
test.beforeEach(()=>{
 snapshot=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.CRON_SECRET=secret;
 delete process.env.VERCEL_ENV;
 delete process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED;
 delete process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED;
 delete process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED;
});
test.afterEach(()=>{
 for(const [k,v] of Object.entries(snapshot))
  if(v===undefined)delete process.env[k];else process.env[k]=v;
});
test("cron credentials must be a strong, exact bearer, not query or custom header",async()=>{
 delete process.env.CRON_SECRET;
 assert.equal((await GET(request())).status,503);
 process.env.CRON_SECRET=secret;
 for(const req of [
  request({},"?secret="+secret),
  request({"x-cron-secret":secret}),
  request({authorization:"Bearer invalid"}),
  request({authorization:"Basic "+secret}),
 ]){
   assert.equal((await GET(req)).status,401);
 }
});
test("production is HARD BLOCKED even if all feature switches are explicitly enabled",async()=>{
 process.env.VERCEL_ENV="production";
 process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED="true";
 process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED="true";
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 const result=await GET(request({authorization:"Bearer "+secret}));
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{
   ok:true,skipped:true,reason:"STAGING_SMTP_DISABLED",
   claimed:0,smtpAccepted:0,unknown:0,delivered:false,
 });
});
test("preview without every individual opt-in flag also performs no send",async()=>{
 process.env.VERCEL_ENV="preview";
 for(const disabled of [
   "ALTOVENA_EMAIL_STAGING_SEND_ENABLED",
   "ALTOVENA_DELIVERY_PREFLIGHT_ENABLED",
   "ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
 ]){
   for(const key of [
     "ALTOVENA_EMAIL_STAGING_SEND_ENABLED",
     "ALTOVENA_DELIVERY_PREFLIGHT_ENABLED",
     "ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
   ])process.env[key]="true";
   delete process.env[disabled];
   const result=await GET(request({authorization:"Bearer "+secret}));
   assert.equal(result.status,200);
   assert.equal((await result.json()).skipped,true);
 }
});
