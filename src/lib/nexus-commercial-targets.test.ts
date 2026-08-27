import assert from "node:assert/strict";
import test from "node:test";
import {
  targetsFromGrowthPlanRows,
  upsertCommercialTargetMetadata,
} from "@/lib/nexus-commercial-targets";

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
