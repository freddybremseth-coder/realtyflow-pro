import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSocialStrategySnapshot,
  inferSocialCategory,
  socialCategoryForSource,
} from "./social-strategy";

test("ZenEco strategy caps property recommendations at 20 percent", () => {
  const rows = [
    { tags: ["social-category-property"], published_at: "2026-10-07" },
    { tags: ["social-category-area-lifestyle"], published_at: "2026-10-06" },
    { tags: ["social-category-guide-competence"], published_at: "2026-10-05" },
    { tags: ["social-category-market-insight"], published_at: "2026-10-04" },
    { tags: ["social-category-area-lifestyle"], published_at: "2026-10-03" },
  ];
  const snapshot = buildSocialStrategySnapshot(rows, "zeneco");
  assert.equal(snapshot.propertyShare, 0.2);
  assert.equal(snapshot.propertyRecommendationAllowed, false);
  assert.notEqual(snapshot.recommendedCategory, "property");
  assert.match(snapshot.recommendationReason, /20 % som tak/);
});

test("ZenEco strategy enforces four non-property posts after a property post", () => {
  const rows = [
    { tags: ["social-category-guide-competence"] },
    { tags: ["social-category-property"] },
    { tags: ["social-category-area-lifestyle"] },
    { tags: ["social-category-market-insight"] },
    { tags: ["social-category-proof-process"] },
    { tags: ["social-category-people-advisor"] },
    { tags: ["social-category-area-lifestyle"] },
    { tags: ["social-category-guide-competence"] },
    { tags: ["social-category-market-insight"] },
    { tags: ["social-category-proof-process"] },
  ];
  const snapshot = buildSocialStrategySnapshot(rows, "zeneco");
  assert.equal(snapshot.postsSinceLastProperty, 1);
  assert.equal(snapshot.propertyRecommendationAllowed, false);
  assert.notEqual(snapshot.recommendedCategory, "property");
  assert.match(snapshot.recommendationReason, /minst fire/);
});

test("social category inference prefers explicit metadata and supports legacy tags", () => {
  assert.equal(inferSocialCategory({
    content_features: { social_category: "market_insight" },
    tags: ["source-property"],
  }), "market_insight");
  assert.equal(inferSocialCategory({ tags: ["source-property"] }), "property");
  assert.equal(inferSocialCategory({ tags: ["social-category-area-lifestyle"] }), "area_lifestyle");
  assert.equal(inferSocialCategory({ title: "Guide til boliglån og kostnader i Spania" }), "guide_competence");
});

test("source categories are deterministic for property, area, guide and topic", () => {
  assert.equal(socialCategoryForSource({ sourceType: "property" }), "property");
  assert.equal(socialCategoryForSource({ sourceType: "area" }), "area_lifestyle");
  assert.equal(socialCategoryForSource({ sourceType: "article", contentKind: "guide" }), "guide_competence");
  assert.equal(socialCategoryForSource({ sourceType: "article", contentKind: "magazine" }), "market_insight");
  assert.equal(socialCategoryForSource({ sourceType: "topic" }), "market_insight");
});
