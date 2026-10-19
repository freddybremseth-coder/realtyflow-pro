import assert from "node:assert/strict";
import test from "node:test";
import {NextRequest} from "next/server";
import {POST as intake} from "../../src/app/api/public/altovena-leads/route";
import {GET as leadScan} from "../../src/app/api/cron/altovena-lead-alerts/route";
import {GET as preflight} from "../../src/app/api/cron/altovena-delivery-preflight/route";
import {GET as smtp} from "../../src/app/api/cron/altovena-smtp-staging/route";
import {requireBrandWorkspace} from "../../src/lib/workspaces/require-brand-workspace";

const base="https://realtyflow-preview.example";
const secret="isolated-test-only-cron-secret-2026";
const keys=[
 "VERCEL_ENV","ALTOVENA_STAGING_ISOLATION_ENABLED",
 "ALTOVENA_STAGING_SUPABASE_PROJECT_REF",
 "NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY",
 "ALTOVENA_INTAKE_ENABLED","ALTOVENA_INTAKE_KEY","CRON_SECRET",
 "ALTOVENA_LEAD_ALERT_SCAN_ENABLED",
 "ALTOVENA_DELIVERY_PREFLIGHT_ENABLED",
 "ALTOVENA_EMAIL_STAGING_SEND_ENABLED",
];
let prev:Record<string,string|undefined>={};
test.beforeEach(()=>{
 prev=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.VERCEL_ENV="preview";
 process.env.ALTOVENA_STAGING_ISOLATION_ENABLED="true";
 process.env.ALTOVENA_STAGING_SUPABASE_PROJECT_REF="abcdefghijklmnopqrst";
 process.env.NEXT_PUBLIC_SUPABASE_URL="https://ereapsfcsqtdmzosgnnn.supabase.co";
 process.env.SUPABASE_SERVICE_ROLE_KEY="fake-key-never-use";
 process.env.ALTOVENA_INTAKE_ENABLED="true";
 process.env.ALTOVENA_INTAKE_KEY="x".repeat(40);
 process.env.CRON_SECRET=secret;
 process.env.ALTOVENA_LEAD_ALERT_SCAN_ENABLED="true";
 process.env.ALTOVENA_DELIVERY_PREFLIGHT_ENABLED="true";
 process.env.ALTOVENA_EMAIL_STAGING_SEND_ENABLED="true";
});
test.afterEach(()=>{
 for(const [key,value] of Object.entries(prev))
  if(value===undefined)delete process.env[key];else process.env[key]=value;
});
test("real public intake must refuse misbound preview before ingest validation or CRM",async()=>{
 const r=await intake(new NextRequest(base+"/api/public/altovena-leads",{
  method:"POST",headers:{"Content-Type":"application/json",
   "x-altovena-ingest-key":process.env.ALTOVENA_INTAKE_KEY!},
  body:"{}",
 }));
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED");
});
test("CRM guard denies preview reads BEFORE consulting live employee Auth",async()=>{
 const r=await requireBrandWorkspace(new NextRequest(base+"/api/workspaces/altovena/lead-tasks"),
  "altovena","crm.read");
 assert.equal(r.value,null);
 assert.equal(r.response.status,503);
 assert.equal((await r.response.json()).error.code,"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED");
});
test("all Cron stages reject shared production Supabase before live database work",async()=>{
 const req=(path:string)=>new NextRequest(base+path,{
  headers:{authorization:"Bearer "+secret},
 });
 for(const [path,handler] of [
  ["/api/cron/altovena-lead-alerts",leadScan],
  ["/api/cron/altovena-delivery-preflight",preflight],
  ["/api/cron/altovena-smtp-staging",smtp],
 ] as const){
  const response=await handler(req(path));
  assert.equal(response.status,503,path);
  const body=await response.json();
  assert.equal(body.error,"ALTOVENA_PREVIEW_DATABASE_NOT_ISOLATED",path);
 }
});
