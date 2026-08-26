import assert from "node:assert/strict";
import { test } from "node:test";
import type { NexusPipelineHealth } from "@/lib/nexus-pipeline-health";
import { directorMissionsFromPipelineHealth } from "@/lib/nexus-health-director";

function health(overrides: Partial<NexusPipelineHealth> = {}): NexusPipelineHealth {
  return {
    brandId: "zeneco",
    pipelineId: "real_estate_sales",
    activeOpportunities: 8,
    phaseCounts: { awareness: 0, engagement: 1, qualification: 2, consideration: 3, conversion: 2, delivery: 0, retention: 0 },
    staleOpportunities: 0,
    staleConversionOpportunities: 0,
    unknownFreshness: 0,
    highestPriorityScore: 90,
    visibleValueByCurrency: { EUR: 700000 },
    health: "ACTIVE",
    reasons: [],
    ...overrides,
  };
}

test("target alone cannot create lead-gap mission without source evidence", () => {
  const missions = directorMissionsFromPipelineHealth(health(), { targets: { targetNewPerWeek: 10 } });
  assert.equal(missions.some((item) => item.kind === "generate_demand"), false);
});

test("documented new-opportunity count plus explicit target can create demand mission", () => {
  const missions = directorMissionsFromPipelineHealth(health(), {
    evidence: { newOpportunities7d: 2 },
    targets: { targetNewPerWeek: 10 },
  });
  assert.equal(missions.some((item) => item.kind === "generate_demand"), true);
});

test("stale conversion creates critical closer mission without numeric goals", () => {
  const missions = directorMissionsFromPipelineHealth(health({ staleOpportunities: 2, staleConversionOpportunities: 1, health: "CRITICAL" }));
  const closer = missions.find((item) => item.role === "closer");
  assert.equal(closer?.priority, "CRITICAL");
  assert.equal(closer?.kind, "recover_stalled");
});

test("conversion target requires documented realized conversion count", () => {
  const withoutEvidence = directorMissionsFromPipelineHealth(health(), { targets: { targetConversionsPerMonth: 5 } });
  assert.equal(withoutEvidence.some((item) => item.kind === "close_revenue"), false);

  const withEvidence = directorMissionsFromPipelineHealth(health(), {
    evidence: { realizedConversions30d: 1 },
    targets: { targetConversionsPerMonth: 5 },
  });
  assert.equal(withEvidence.some((item) => item.kind === "close_revenue"), true);
});
