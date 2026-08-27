import assert from "node:assert/strict";
import test from "node:test";
import { buildNexusGrowthMission } from "./nexus-growth-mission";
import { buildNexusMissionAgenticPlan } from "./nexus-mission-agentic";
import {
  buildRealEstateQualificationBrief,
  canPrepareRealEstateQualificationMission,
} from "./nexus-real-estate-qualification-preparer";

const opportunity = {
  id: "opp-1",
  brandId: "soleada",
  offerId: "buyer_advisory",
  pipelineId: "real_estate_sales" as const,
  pipelineName: "Real Estate Sales",
  stageId: "qualified_buyer",
  stageLabel: "Qualified buyer",
  phase: "qualification" as const,
  terminal: false,
  successEvent: "property_sale",
  opportunityLabel: "Buyer",
  title: "Test Buyer",
  reason: "mangler neste oppfølgingsdato",
  nextAction: "Kjør property matching og send 3–5 kvalitetssikrede alternativer.",
  priority: "CRITICAL" as const,
  priorityScore: 100,
  value: 450000,
  currency: "EUR",
  routeConfidence: "high" as const,
  href: "/customers/test",
};

test("qualified buyer is governed as enrichment, not customer draft", () => {
  const mission = buildNexusGrowthMission(opportunity as never);
  const plan = buildNexusMissionAgenticPlan(mission);
  assert.equal(mission.objective, "qualify");
  assert.equal(plan.actionClass, "enrich");
  assert.equal(canPrepareRealEstateQualificationMission(mission, plan), true);
});

test("qualification brief includes core and lifestyle gaps without sending", () => {
  const mission = buildNexusGrowthMission(opportunity as never);
  const brief = buildRealEstateQualificationBrief(
    mission,
    {
      id: "contact-1",
      name: "Kari Kunde",
      email: "kari@example.com",
      phone: "+4712345678",
      pipeline_value: 450000,
      property_interest: "Albir",
      next_followup: null,
      notes: "Liker strand og restauranter",
      brand_id: "soleada",
    },
    null,
    [],
  );
  assert.equal(brief.metadata.external_action_executed, false);
  assert.equal(brief.metadata.buyer_profile_exists, false);
  assert.equal(brief.missing.includes("Strukturert Buyer Profile"), true);
  assert.equal(brief.lifestyle.discoveryGaps.some((item) => item.key === "daily_life:beach_walkability"), true);
});

test("confirmed lifestyle criteria reduce discovery gaps while inferred signals remain separate", () => {
  const mission = buildNexusGrowthMission(opportunity as never);
  const brief = buildRealEstateQualificationBrief(
    mission,
    {
      id: "contact-1",
      name: "Kari Kunde",
      email: "kari@example.com",
      phone: "+4712345678",
      pipeline_value: 450000,
      property_interest: "Albir",
      next_followup: null,
      brand_id: "soleada",
    },
    { id: "profile-1", budget_amount: 450000, budget_currency: "EUR", purchase_readiness: "warm" },
    [
      {
        key: "other",
        other_key: "daily_life:beach_walkability",
        criterion_type: "preference",
        value: true,
        weight: 0.95,
        source: "manual",
        customer_confirmed: true,
        approval_status: "approved",
        active: true,
      },
      {
        key: "other",
        other_key: "social:scandinavian",
        criterion_type: "preference",
        value: true,
        weight: 0.6,
        source: "ai_inference",
        confidence: 0.55,
        customer_confirmed: false,
        approval_status: "approved",
        active: true,
      },
    ] as never,
  );
  assert.equal(brief.lifestyle.confirmedCount, 1);
  assert.equal(brief.lifestyle.inferredCount, 1);
  assert.equal(brief.lifestyle.discoveryGaps.some((item) => item.key === "daily_life:beach_walkability"), false);
});
