import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCommercialTargetEvidence,
  commercialTargetConfigByPipeline,
  targetsFromGrowthPlanRows,
  upsertCommercialTargetMetadata,
} from "@/lib/nexus-commercial-targets";
import type { NexusSyncHealth } from "@/lib/nexus-sync-health";

function syncHealth(overrides: Partial<NexusSyncHealth> = {}): NexusSyncHealth {
  return {
    state: "healthy",
    trustedForPipelineDecisions: true,
    lastRunAt: "2026-08-27T06:45:00.000Z",
    lastStatus: "success",
    lastError: null,
    ageMinutes: 5,
    storeCount: 10,
    reason: "fresh",
    ...overrides,
  };
}

function opportunity(brandId: string, pipelineId: string, createdAt: string) {
  return {
    brand_id: brandId,
    pipeline_id: pipelineId,
    created_at: createdAt,
  } as any;
}

test("reads only explicit positive targets from active growth plans", () => {
  const targets = targetsFromGrowthPlanRows([
    {
      brand_id: "chatgenius",
      status: "active",
      metadata: {
        nexus_commercial_targets: [
          { pipelineId: "ai_products_services", targetNewPerWeek: 20, targetConversionsPerMonth: 4 },
        ],
      },
    },
    {
      brand_id: "zeneco",
      status: "setup",
      metadata: {
        nexus_commercial_targets: [{ pipelineId: "real_estate_sales", targetNewPerWeek: 5 }],
      },
    },
  ]);

  assert.equal(targets.length, 1);
  assert.equal(targets[0].brandId, "chatgenius");
  assert.equal(targets[0].targetNewPerWeek, 20);
  assert.equal(targets[0].targetConversionsPerMonth, 4);
});

test("does not invent a target from qualitative conversion goals", () => {
  const targets = targetsFromGrowthPlanRows([
    {
      brand_id: "zeneco",
      status: "active",
      metadata: { brand_role: "real_estate" },
    },
  ]);
  assert.deepEqual(targets, []);
});

test("upsert preserves unrelated metadata and replaces only the same pipeline target", () => {
  const metadata = upsertCommercialTargetMetadata({
    brand_role: "saas_b2b",
    nexus_commercial_targets: [
      { pipelineId: "ai_products_services", targetNewPerWeek: 10 },
      { pipelineId: "expert_advisory", targetNewPerWeek: 2 },
    ],
  }, {
    pipelineId: "ai_products_services",
    targetNewPerWeek: 20,
    targetConversionsPerMonth: 4,
    updatedAt: "2026-08-27T06:00:00.000Z",
  });

  assert.equal(metadata.brand_role, "saas_b2b");
  const rows = metadata.nexus_commercial_targets as Array<Record<string, unknown>>;
  assert.equal(rows.length, 2);
  const ai = rows.find((row) => row.pipelineId === "ai_products_services");
  assert.equal(ai?.targetNewPerWeek, 20);
  assert.equal(ai?.targetConversionsPerMonth, 4);
});

test("null or zero values remove the pipeline target instead of creating a zero target", () => {
  const metadata = upsertCommercialTargetMetadata({
    nexus_commercial_targets: [{ pipelineId: "publishing", targetNewPerWeek: 5 }],
  }, {
    pipelineId: "publishing",
    targetNewPerWeek: 0,
    targetConversionsPerMonth: null,
  });
  assert.deepEqual(metadata.nexus_commercial_targets, []);
});

test("does not activate weekly demand target during the seven-day Nexus bootstrap baseline", () => {
  const now = new Date("2026-08-27T07:00:00.000Z");
  const evidence = buildCommercialTargetEvidence([
    {
      brandId: "chatgenius",
      pipelineId: "ai_products_services",
      targetNewPerWeek: 20,
      targetConversionsPerMonth: 4,
      updatedAt: null,
    },
  ], [
    opportunity("chatgenius", "ai_products_services", "2026-08-24T07:00:00.000Z"),
  ], syncHealth(), now);

  assert.equal(evidence[0].acquisitionEvidenceReady, false);
  assert.equal(evidence[0].newOpportunities7d, null);
  assert.equal(evidence[0].conversionEvidenceReady, false);
  assert.equal(evidence[0].realizedConversions30d, null);
});

test("activates weekly acquisition evidence only after trusted seven-day observation", () => {
  const now = new Date("2026-08-27T07:00:00.000Z");
  const evidence = buildCommercialTargetEvidence([
    {
      brandId: "zeneco",
      pipelineId: "real_estate_sales",
      targetNewPerWeek: 5,
      targetConversionsPerMonth: null,
      updatedAt: null,
    },
  ], [
    opportunity("zeneco", "real_estate_sales", "2026-08-18T07:00:00.000Z"),
    opportunity("zeneco", "real_estate_sales", "2026-08-23T07:00:00.000Z"),
    opportunity("zeneco", "real_estate_sales", "2026-08-26T07:00:00.000Z"),
  ], syncHealth(), now);

  assert.equal(evidence[0].acquisitionEvidenceReady, true);
  assert.equal(evidence[0].newOpportunities7d, 2);
  const config = commercialTargetConfigByPipeline(evidence);
  assert.equal(config["zeneco:real_estate_sales"].evidence.newOpportunities7d, 2);
  assert.equal(config["zeneco:real_estate_sales"].targets.targetNewPerWeek, 5);
});

test("stale sync closes the target evidence gate even after a long baseline", () => {
  const evidence = buildCommercialTargetEvidence([
    {
      brandId: "zeneco",
      pipelineId: "real_estate_sales",
      targetNewPerWeek: 5,
      targetConversionsPerMonth: null,
      updatedAt: null,
    },
  ], [
    opportunity("zeneco", "real_estate_sales", "2026-08-01T07:00:00.000Z"),
  ], syncHealth({ state: "stale", trustedForPipelineDecisions: false }), new Date("2026-08-27T07:00:00.000Z"));

  assert.equal(evidence[0].acquisitionEvidenceReady, false);
  assert.equal(evidence[0].newOpportunities7d, null);
  assert.equal(commercialTargetConfigByPipeline(evidence)["zeneco:real_estate_sales"].evidence.newOpportunities7d, null);
});
