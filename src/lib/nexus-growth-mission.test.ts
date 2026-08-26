import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusBusinessOpportunity } from "@/lib/nexus-business-opportunity";
import { buildNexusGrowthMission, rankNexusGrowthMissions } from "@/lib/nexus-growth-mission";

function opportunity(overrides: Partial<Parameters<typeof buildNexusBusinessOpportunity>[0]> = {}) {
  const value = buildNexusBusinessOpportunity({
    id: "opp-1",
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    stageId: "negotiation",
    title: "Kjøper nær reservasjon",
    reason: "Pris og vilkår diskuteres.",
    priorityScore: 92,
    value: 600000,
    currency: "EUR",
    sourceSystem: "revenue_today",
    href: "/today",
    routeConfidence: "high",
    ...overrides,
  });
  assert.ok(value);
  return value;
}

test("conversion opportunities are owned by the closer and approval-gated", () => {
  const mission = buildNexusGrowthMission(opportunity());
  assert.equal(mission.role, "closer");
  assert.equal(mission.objective, "close");
  assert.equal(mission.autonomy, "approval");
  assert.equal(mission.dueInHours, 2);
});

test("publishing engagement uses content/influencer role instead of property sales semantics", () => {
  const mission = buildNexusGrowthMission(opportunity({
    id: "book-1",
    brandId: "freddypublishing",
    pipelineId: "publishing",
    stageId: "sample_engaged",
    title: "Leser har prøvelest",
    value: 12.99,
    priorityScore: 62,
  }));
  assert.equal(mission.role, "content_influencer");
  assert.equal(mission.objective, "create_engagement");
  assert.equal(mission.autonomy, "prepare");
});

test("low-confidence umbrella routing stays suggestion-only", () => {
  const mission = buildNexusGrowthMission(opportunity({
    id: "advisor-1",
    brandId: "freddyb",
    pipelineId: "expert_advisory",
    stageId: "inquiry",
    title: "Uklart Freddy-lead",
    routeConfidence: "low",
    priorityScore: 70,
  }));
  assert.equal(mission.autonomy, "suggest");
});

test("ranking favors high-priority closing work with material value", () => {
  const closing = buildNexusGrowthMission(opportunity());
  const awareness = buildNexusGrowthMission(opportunity({
    id: "media-1",
    brandId: "remasterfreddy",
    pipelineId: "creator_media",
    stageId: "discovered",
    title: "Ny videooppdagelse",
    priorityScore: 70,
    value: 0,
    currency: null,
  }));
  assert.equal(rankNexusGrowthMissions([awareness, closing], 2)[0]?.role, "closer");
});
