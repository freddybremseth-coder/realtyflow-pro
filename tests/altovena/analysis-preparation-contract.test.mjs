import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const api=read("src/app/api/altovena/command/analysis/route.ts");
const migration=read("supabase/migrations/20261017001500_altovena_command_analysis_preparation.sql");
const ui=read("src/app/(realty)/altovena/command/page.tsx");
test("preparation route must use signed owner session, single mission ID and same origin",()=>{
 assert.match(api,/requirePlatformOwner\(request\)/);
 assert.match(api,/owner-session/);
 assert.match(api,/origin_mismatch/);
 assert.match(api,/Object\.keys\(body\)\.length !== 1/);
 assert.match(api,/p_actor_email: auth\.context!\.context\.email/);
 assert.doesNotMatch(api,/body\.goal|body\.actor|body\.agents|body\.budget|body\.plan/);
});
test("preparation is immutable and has an explicit zero-call/zero-cost ceiling",()=>{
 assert.match(migration,/CHECK \(state='prepared'\)/);
 assert.match(migration,/CHECK \(max_model_calls=0\)/);
 assert.match(migration,/CHECK \(max_cost_cents=0\)/);
 assert.match(migration,/CHECK \(permitted_external_actions=false\)/);
 assert.match(migration,/BEFORE UPDATE OR DELETE/);
 assert.match(migration,/mission\.analysis_prepared/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.altovena_internal_command_analysis_prepare\(uuid,text\)/);
 assert.doesNotMatch(migration,/INSERT INTO core\.nexus_execution_tasks|INSERT INTO altovena\.tasks/i);
});
test("UI describes preparation truthfully without a misleading execution state",()=>{
 assert.match(ui,/Forbered analyse/);
 assert.match(ui,/Ingen AI-agent eller modell er startet/);
 assert.match(ui,/0 modellkall/);
 assert.doesNotMatch(api,/callAI|runMultiAgentTask|executeCommand|claimApprovedNexusTask|fetch\(/);
});
