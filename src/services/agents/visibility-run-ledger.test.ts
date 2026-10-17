import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VISIBILITY_RUN_ACTION, makeVisibilityRunEntry,
  parseVisibilityRunStatus, recordVisibilityRun } from "./visibility-run-ledger";

const read=(path:string)=>readFileSync(new URL("../../../"+path,import.meta.url),"utf8");

test("run completion is distinct from an actual independent SEO observation",async()=>{
 const writes:Array<{table:string;row:Record<string,unknown>}>=[];
 const db={from:(table:string)=>({insert:async(row:Record<string,unknown>)=>{
  writes.push({table,row});return {error:null};
 }})} as unknown as SupabaseClient;
 const run=makeVisibilityRunEntry("cron","COMPLETED","NO_ELIGIBLE_TASKS",
   {investigated:0,skipped:2,failed:0});
 assert.equal(await recordVisibilityRun(db,run),true);
 assert.equal(writes.length,1);
 assert.equal(writes[0].table,"automation_logs");
 assert.equal(writes[0].row.action,VISIBILITY_RUN_ACTION);
 assert.equal(run.readOnly,true);
 assert.equal(run.publicationAuthorized,false);
 assert.equal(run.resolutionVerified,false);
 assert.equal(run.executionStarted,false);
 assert.equal((writes[0].row.details as {investigated:number}).investigated,0);
});
test("skipped and failed runs have explicit bounded reasons and never set VERIFIED",()=>{
 for(const [outcome,reason] of [
   ["SKIPPED","SAFE_MODE"],["SKIPPED","SOURCE_REPORT_STALE"],
   ["FAILED","INVESTIGATION_ERROR"],["FAILED","SOURCE_REPORT_UNAVAILABLE"],
 ] as const){
  const run=makeVisibilityRunEntry("cron",outcome,reason);
  const parsed=parseVisibilityRunStatus({created_at:"2026-10-17T09:00:00Z",details:{
   source:run.source,outcome:run.outcome,reason:run.reason,
   investigated:run.investigated,failed:run.failed,skipped:run.skipped,
   readOnly:true,executionStarted:false,publicationAuthorized:false,resolutionVerified:false,
  }});
  assert.equal(parsed?.outcome,outcome);
  assert.equal(parsed?.reason,reason);
  assert.equal(parsed?.resolutionVerified,false);
 }
});
test("untrusted run metadata cannot pretend a repaired website",()=>{
 const basic=makeVisibilityRunEntry("owner","COMPLETED","NONE",{investigated:1});
 assert.equal(parseVisibilityRunStatus({created_at:"2026-10-17T09:00:00Z",details:{
  ...basic,publicationAuthorized:true,
 }}),null);
 assert.equal(parseVisibilityRunStatus({created_at:"2026-10-17T09:00:00Z",details:{
  ...basic,resolutionVerified:true,
 }}),null);
 assert.equal(parseVisibilityRunStatus({created_at:"2026-10-17T09:00:00Z",details:{
  ...basic,source:"untrusted",
 }}),null);
 assert.equal(parseVisibilityRunStatus({created_at:"not-a-date",details:basic}),null);
 assert.equal(makeVisibilityRunEntry("owner","FAILED","INVESTIGATION_ERROR",
 {investigated:-4,skipped:NaN,failed:Infinity}).investigated,0);
});
test("failed telemetry insert cannot silently become a success log",async()=>{
 const db={from:()=>({insert:async()=>({error:{message:"Database not available"}})})}
  as unknown as SupabaseClient;
 const ok=await recordVisibilityRun(db,makeVisibilityRunEntry("owner","FAILED","INVESTIGATION_ERROR"));
 assert.equal(ok,false);
 const thrown={from:()=>({insert:async()=>{throw new Error("connection lost")}})} as unknown as SupabaseClient;
 assert.equal(await recordVisibilityRun(thrown,makeVisibilityRunEntry("owner","FAILED","INVESTIGATION_ERROR")),false);
});
test("cron and manual controls both honor Nexus runtime safety and record outcomes",()=>{
 const cron=read("src/app/api/cron/visibility-investigations/route.ts");
 const owner=read("src/app/api/visibility/investigations/run/route.ts");
 const api=read("src/app/api/visibility/work-items/route.ts");
 const ui=read("src/components/visibility/visibility-work-queue.tsx");
 assert.match(cron,/requireCronApi\(request\)/);
 assert.match(cron,/evaluateCronSafeMode\(PATH\)/);
 assert.match(owner,/ctx\?\.role !== "OWNER"/);
 assert.match(owner,/ctx\.source !== "owner-session"/);
 assert.match(owner,/evaluateCronSafeMode\("\/api\/cron\/visibility-investigations"\)/);
 assert.match(owner,/sec-fetch-site/);
 assert.match(cron,/recordVisibilityRun\(/);
 assert.match(owner,/recordVisibilityRun\(/);
 assert.match(api,/parseVisibilityRunStatus/);
 assert.match(api,/lastCronRun/);
 assert.match(ui,/Ingen registrerte kjøringer/);
 assert.match(ui,/Ingen kontrollbevis registrert/);
 assert.doesNotMatch(cron,/request\.json\(/);
 assert.doesNotMatch(owner,/request\.json\(/);
});
