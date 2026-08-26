import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BRAND_BUSINESS_BINDINGS,
  BUSINESS_PIPELINES,
  businessPipelineForBrand,
  businessStage,
  defaultBusinessNextAction,
} from "@/lib/business-pipeline-registry";

test("every owned growth brand has an explicit business pipeline binding", () => {
  const expected = ["zeneco", "pinosoecolife", "donaanna", "chatgenius", "freddyb", "freddypublishing", "freddyai", "remasterfreddy"];
  assert.deepEqual([...BRAND_BUSINESS_BINDINGS].map((row) => row.brandId).sort(), expected.sort());
});

test("real estate, publishing, AI and advisory use different pipelines", () => {
  assert.equal(businessPipelineForBrand("zeneco")?.pipeline.id, "real_estate_sales");
  assert.equal(businessPipelineForBrand("freddypublishing")?.pipeline.id, "publishing");
  assert.equal(businessPipelineForBrand("freddyai")?.pipeline.id, "ai_products_services");
  assert.equal(businessPipelineForBrand("freddyb")?.pipeline.id, "expert_advisory");
});

test("domain stages preserve distinct next actions instead of sharing a generic funnel", () => {
  assert.match(defaultBusinessNextAction("real_estate_sales", "viewing") || "", /visningsplan/i);
  assert.match(defaultBusinessNextAction("publishing", "sample_engaged") || "", /prøvekapittel|omtale/i);
  assert.match(defaultBusinessNextAction("ai_products_services", "demo_or_solution") || "", /arbeidsflyt/i);
  assert.match(defaultBusinessNextAction("expert_advisory", "scope_defined") || "", /leveranse/i);
  assert.equal(businessStage("publishing", "viewing"), null);
  assert.equal(businessStage("real_estate_sales", "sample_engaged"), null);
});

test("pipelines share only a comparison lifecycle, not identical stage names", () => {
  const phases = new Set(BUSINESS_PIPELINES.flatMap((pipeline) => pipeline.stages.map((stage) => stage.phase)));
  assert.equal(phases.has("awareness"), true);
  assert.equal(phases.has("consideration"), true);
  assert.equal(phases.has("conversion"), true);
  assert.equal(phases.has("retention"), true);

  const realEstateStages = businessPipelineForBrand("zeneco")?.pipeline.stages.map((stage) => stage.id) || [];
  const publishingStages = businessPipelineForBrand("freddypublishing")?.pipeline.stages.map((stage) => stage.id) || [];
  assert.equal(realEstateStages.includes("viewing"), true);
  assert.equal(publishingStages.includes("viewing"), false);
  assert.equal(publishingStages.includes("sample_engaged"), true);
});

test("Freddy professional is an umbrella/advisory binding, not a catch-all commercial funnel", () => {
  const freddy = businessPipelineForBrand("freddyb");
  assert.equal(freddy?.binding.role, "umbrella");
  assert.equal(freddy?.pipeline.id, "expert_advisory");
  assert.match(freddy?.binding.note || "", /underliggende commercial pipeline/i);
});
