import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const route=read("src/app/api/altovena/command/plan/route.ts");
const router=read("src/lib/altovena/command-routing-plan.ts");
const migration=read("supabase/migrations/20261016211500_altovena_command_routing_plans.sql");

test("Nexus routing catalog is real and no agent is invoked while planning",()=>{
 assert.match(router,/AGENT_FLEET_BINDINGS/);
 assert.match(router,/buildNexusAdvisorSystemRouting/);
 assert.match(router,/ROUTING_PROPOSAL_ONLY/);
 assert.match(router,/approvedForExecution: false/);
 assert.match(router,/permittedExternalActions: false/);
 assert.doesNotMatch(router,/executeCommand|runMultiAgentTask|executeTasks|callAI/);
});
test("route restricts plan creation to verified signed owner, same-origin POST and server-controlled plan",()=>{
 assert.match(route,/requirePlatformOwner\(request\)/);
 assert.match(route,/owner-session/);
 assert.match(route,/origin_mismatch/);
 assert.match(route,/p_plan:plan/);
 assert.match(route,/buildAltovenaCommandRoutingPlan\(missionId,drafts\[0\]\.goal\)/);
 assert.doesNotMatch(route,/body\.goal|body\.agents|body\.plan|body\.actor/);
});
test("database stores proposals only and permissions remain service-only",()=>{
 assert.match(migration,/CREATE TABLE altovena\.mission_route_plans/);
 assert.match(migration,/CHECK \(status='proposed'\)/);
 assert.match(migration,/REVOKE ALL ON altovena\.mission_route_plans/);
 assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.altovena_internal_command_plan_propose\(text,uuid,jsonb\) TO service_role/);
 assert.match(migration,/mission\.routing_proposed/);
 assert.doesNotMatch(migration,/INSERT INTO altovena\.tasks|UPDATE altovena\.approvals/);
});
