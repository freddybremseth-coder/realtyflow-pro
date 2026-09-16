import assert from "node:assert/strict";
import test from "node:test";
import { buildNexusAdvisorSystemRouting } from "./nexus-advisor-system-routing";

const agents = [
  { agentName: "Elena Email AI", role: "E-postassistent", expertise: ["email"], availableTasks: ["analyze_email", "draft_reply"] },
  { agentName: "Jordan Sales Master", role: "Sales", expertise: ["sales"], availableTasks: ["analyze_conversion"] },
];

test("email CRM request receives the existing governed system chain", () => {
  const routing = buildNexusAdvisorSystemRouting("Gå gjennom alle e-poster og oppdater CRM på kundene", agents);
  assert.equal(routing.policy.advisorRole, "orchestrator_only");
  assert.equal(routing.policy.directBulkCrmMutationFromAdvisor, false);
  assert.equal(routing.policy.directCustomerSendFromAdvisor, false);
  assert.ok(routing.emailCrmChain);
  assert.ok(routing.relevantAutomations.some((row) => row.id === "/api/cron/email-crm-sync"));
  assert.ok(routing.relevantAutomations.some((row) => row.id === "/api/cron/nexus-buyer-profile-sync"));
  assert.ok(routing.modules.some((row) => row.id === "email-link-health"));
});

test("advisor exposes existing agents instead of inventing an execution path", () => {
  const routing = buildNexusAdvisorSystemRouting("analyser e-post og salg", agents);
  assert.deepEqual(routing.agents.map((row) => row.label), ["Elena Email AI", "Jordan Sales Master"]);
  assert.equal(routing.policy.existingReviewAndApprovalGatesRemainAuthoritative, true);
});
