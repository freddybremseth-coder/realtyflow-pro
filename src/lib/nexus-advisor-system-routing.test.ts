import assert from "node:assert/strict";
import test from "node:test";
import { buildNexusAdvisorSystemRouting } from "./nexus-advisor-system-routing";
import type { AgentCapability } from "@/services/agents/base-agent";

const agents: AgentCapability[] = [
  {
    agentName: "Alex Marketing Pro",
    role: "Marketing Strategist",
    expertise: ["campaign optimization", "social media strategy"],
    availableTasks: ["create_campaign_strategy", "create_content"],
  },
  {
    agentName: "Sam SEO Expert",
    role: "SEO & Organic Growth Specialist",
    expertise: ["keyword research", "on-page SEO"],
    availableTasks: ["keyword_research", "optimize_for_seo"],
  },
];

test("bulk email CRM request is routed through the existing governed email chain", () => {
  const result = buildNexusAdvisorSystemRouting(
    "Gå gjennom alle e-poster og legg korrekt informasjon på kundene i CRM",
    agents,
  );

  assert.equal(result.policy.advisorRole, "orchestrator_only");
  assert.equal(result.policy.directBulkCrmMutationFromAdvisor, false);
  assert.equal(result.policy.directCustomerSendFromAdvisor, false);
  assert.equal(result.policy.existingReviewAndApprovalGatesRemainAuthoritative, true);
  assert.ok(result.emailCrmChain);
  assert.ok(result.relevantAutomations.some((row) => row.id === "/api/cron/email-crm-sync"));
  assert.ok(result.relevantAutomations.some((row) => row.id === "/api/cron/nexus-buyer-profile-sync"));
  assert.ok(result.modules.some((row) => row.id === "email-readiness"));
  assert.ok(result.modules.some((row) => row.id === "email-link-health"));
});

test("advisor selects existing specialist agents for matching work instead of inventing a new engine", () => {
  const marketing = buildNexusAdvisorSystemRouting("Lag en Facebook-kampanje og optimaliser innholdet", agents);
  assert.equal(marketing.relevantAgents[0]?.id, "Alex Marketing Pro");

  const seo = buildNexusAdvisorSystemRouting("Optimaliser SEO, søkeord og on-page struktur", agents);
  assert.equal(seo.relevantAgents[0]?.id, "Sam SEO Expert");
});

test("non-email requests do not force the email CRM chain", () => {
  const result = buildNexusAdvisorSystemRouting("Hvordan forbedrer vi SEO for Zen Eco Homes?", agents);
  assert.equal(result.emailCrmChain, null);
});
