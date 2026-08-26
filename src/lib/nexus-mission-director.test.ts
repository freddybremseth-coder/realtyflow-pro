import assert from "node:assert/strict";
import { test } from "node:test";
import { directPipelineMissions, rankDirectorMissions, type PipelineHealthInput } from "@/lib/nexus-mission-director";

function health(overrides: Partial<PipelineHealthInput> = {}): PipelineHealthInput {
  return {
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    activeOpportunities: 10,
    newOpportunities7d: 2,
    qualificationOpportunities: 3,
    considerationOpportunities: 3,
    conversionOpportunities: 2,
    deliveryRetentionOpportunities: 2,
    staleOpportunities: 1,
    staleConversionOpportunities: 0,
    targetNewPerWeek: 8,
    targetConversionsPerMonth: 4,
    realizedConversions30d: 1,
    ...overrides,
  };
}

test("top-of-funnel deficit creates a demand-generation mission", () => {
  const missions = directPipelineMissions(health());
  const mission = missions.find((item) => item.kind === "generate_demand");
  assert.ok(mission);
  assert.equal(mission.role, "demand_generation");
  assert.equal(mission.autonomy, "prepare");
});

test("stale conversion work is escalated to closer before lower-priority activity", () => {
  const missions = rankDirectorMissions(directPipelineMissions(health({ staleConversionOpportunities: 2 })));
  assert.equal(missions[0]?.role, "closer");
  assert.equal(missions[0]?.priority, "CRITICAL");
  assert.equal(missions[0]?.kind, "recover_stalled");
  assert.equal(missions[0]?.autonomy, "approval");
});

test("publishing pipeline uses content/influencer role for demand creation", () => {
  const missions = directPipelineMissions(health({ brandId: "freddypublishing", pipelineId: "publishing", newOpportunities7d: 0, targetNewPerWeek: 10 }));
  const demand = missions.find((item) => item.kind === "generate_demand");
  assert.equal(demand?.role, "content_influencer");
  assert.match(demand?.action || "", /sample|serie|retailer/i);
});

test("healthy mid-funnel creates progression mission instead of stale recovery", () => {
  const missions = directPipelineMissions(health({ staleOpportunities: 0, newOpportunities7d: 8, targetNewPerWeek: 8, realizedConversions30d: 4, targetConversionsPerMonth: 4 }));
  assert.equal(missions.some((item) => item.kind === "recover_stalled"), false);
  assert.equal(missions.some((item) => item.kind === "advance_pipeline"), true);
});

test("retention gets explicit capacity rather than ending at first conversion", () => {
  const missions = directPipelineMissions(health({ deliveryRetentionOpportunities: 3 }));
  assert.equal(missions.some((item) => item.role === "customer_success" && item.kind === "retain_expand"), true);
});
