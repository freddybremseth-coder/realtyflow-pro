import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const routeSource = fs.readFileSync(path.join(process.cwd(), "src/app/api/nexus/victoria/route.ts"), "utf8");
const routingSource = fs.readFileSync(path.join(process.cwd(), "src/lib/nexus-advisor-system-routing.ts"), "utf8");

test("Nexus advisor snapshot carries canonical system routing", () => {
  assert.match(routeSource, /buildNexusAdvisorSystemRouting/);
  assert.match(routeSource, /new AgentOrchestrator\(\)\.getAgentCapabilities\(\)/);
  assert.match(routeSource, /system_routing: systemRouting/);
  assert.match(routeSource, /system_routing er det kanoniske kartet/);
});

test("routing explicitly forbids parallel advisor execution paths", () => {
  assert.match(routingSource, /advisorRole: "orchestrator_only"/);
  assert.match(routingSource, /directBulkCrmMutationFromAdvisor: false/);
  assert.match(routingSource, /directCustomerSendFromAdvisor: false/);
  assert.match(routingSource, /existingReviewAndApprovalGatesRemainAuthoritative: true/);
});
