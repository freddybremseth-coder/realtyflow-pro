import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusBusinessOpportunity, isBusinessStageValid } from "@/lib/nexus-business-opportunity";

test("publishing opportunity derives publishing labels and default action", () => {
  const opportunity = buildNexusBusinessOpportunity({
    id: "book-1",
    brandId: "freddypublishing",
    pipelineId: "publishing",
    stageId: "sample_engaged",
    title: "Reader opened sample chapter",
    priorityScore: 72,
    sourceSystem: "book_growth",
    href: "/publishing",
  });
  assert.ok(opportunity);
  assert.equal(opportunity.pipelineName, "Books & publishing");
  assert.equal(opportunity.customerLabel, "Leser");
  assert.equal(opportunity.stageLabel, "Prøvelest");
  assert.equal(opportunity.phase, "engagement");
  assert.equal(opportunity.priority, "MEDIUM");
  assert.match(opportunity.nextAction, /prøvekapittel|omtale|relevante delen/i);
});

test("AI opportunity supports AI-specific demo stage", () => {
  const opportunity = buildNexusBusinessOpportunity({
    id: "ai-1",
    brandId: "freddyai",
    pipelineId: "ai_products_services",
    stageId: "demo_or_solution",
    title: "Prospect wants RealtyFlow demo",
    priorityScore: 88,
    sourceSystem: "crm",
    href: "/customers",
  });
  assert.equal(opportunity?.stageLabel, "Demo / løsning");
  assert.equal(opportunity?.priority, "HIGH");
});

test("real-estate viewing cannot be used in publishing pipeline", () => {
  assert.equal(isBusinessStageValid("publishing", "viewing"), false);
  assert.equal(buildNexusBusinessOpportunity({
    id: "invalid",
    brandId: "freddypublishing",
    pipelineId: "publishing",
    stageId: "viewing",
    title: "Invalid",
    sourceSystem: "test",
    href: "/",
  }), null);
});

test("publishing sample stage cannot be used in AI pipeline", () => {
  assert.equal(isBusinessStageValid("ai_products_services", "sample_engaged"), false);
});

test("explicit next action overrides pipeline default without changing stage semantics", () => {
  const opportunity = buildNexusBusinessOpportunity({
    id: "advisory-1",
    brandId: "freddyb",
    pipelineId: "expert_advisory",
    stageId: "discovery_call",
    title: "Advisory discovery",
    nextAction: "Send meeting summary and request two missing documents.",
    priority: "HIGH",
    priorityScore: 64,
    routeConfidence: "high",
    routeReason: "advisory_lead",
    sourceSystem: "crm",
    href: "/customers",
  });
  assert.equal(opportunity?.nextAction, "Send meeting summary and request two missing documents.");
  assert.equal(opportunity?.phase, "consideration");
  assert.equal(opportunity?.priority, "HIGH");
  assert.equal(opportunity?.routeConfidence, "high");
});
