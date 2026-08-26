import assert from "node:assert/strict";
import { test } from "node:test";
import { routeBusinessOffer } from "@/lib/business-offer-router";

test("Freddy umbrella routes explicit book intent to publishing", () => {
  const route = routeBusinessOffer({ brandId: "freddyb", intents: ["book_page_visit"] });
  assert.equal(route?.pipelineId, "publishing");
  assert.equal(route?.confidence, "high");
  assert.equal(route?.needsReview, false);
});

test("Freddy umbrella routes RealtyFlow interest to AI pipeline", () => {
  const route = routeBusinessOffer({ brandId: "freddyb", text: "I would like a demo of RealtyFlow and Nexus OS" });
  assert.equal(route?.pipelineId, "ai_products_services");
  assert.equal(route?.confidence, "medium");
});

test("Freddy umbrella routes advisory lead to advisory pipeline", () => {
  const route = routeBusinessOffer({ brandId: "freddyb", intents: ["advisory_lead"] });
  assert.equal(route?.pipelineId, "expert_advisory");
  assert.equal(route?.confidence, "high");
});

test("Freddy umbrella without offer evidence is low-confidence review", () => {
  const route = routeBusinessOffer({ brandId: "freddyb" });
  assert.equal(route?.pipelineId, "expert_advisory");
  assert.equal(route?.confidence, "low");
  assert.equal(route?.needsReview, true);
});

test("Doña Anna product_interest resolves to commerce through brand context", () => {
  const route = routeBusinessOffer({ brandId: "donaanna", intents: ["product_interest"] });
  assert.equal(route?.pipelineId, "product_commerce");
  assert.equal(route?.confidence, "high");
});

test("Freddy AI product_interest resolves to AI through brand context", () => {
  const route = routeBusinessOffer({ brandId: "freddyai", intents: ["product_interest"] });
  assert.equal(route?.pipelineId, "ai_products_services");
});

test("property CTA overrides umbrella default", () => {
  const route = routeBusinessOffer({ brandId: "freddyb", ctas: ["book_viewing"] });
  assert.equal(route?.pipelineId, "real_estate_sales");
  assert.equal(route?.confidence, "high");
});

test("explicit pipeline always wins", () => {
  const route = routeBusinessOffer({
    brandId: "freddyb",
    explicitPipelineId: "publishing",
    text: "RealtyFlow demo",
  });
  assert.equal(route?.pipelineId, "publishing");
  assert.equal(route?.source, "explicit_pipeline");
});
