import assert from "node:assert/strict";
import test from "node:test";
import {
  articlePathFromTags,
  assessEditorialLearning,
  nexusAngleFromTags,
  nexusOpportunityIdFromTags,
} from "./property-editorial-learning";

test("keeps fresh or low-volume articles from steering strategy", () => {
  assert.equal(
    assessEditorialLearning({
      ageDays: 3,
      searchArrivals: 30,
      touchpoints: 12,
      leadTouchpoints: 3,
      publicationViews: 100,
    }).evidenceLevel,
    "insufficient",
  );
  assert.equal(
    assessEditorialLearning({
      ageDays: 30,
      searchArrivals: 2,
      touchpoints: 0,
      leadTouchpoints: 0,
      publicationViews: 20,
    }).evidenceLevel,
    "insufficient",
  );
});

test("distinguishes emerging from measured evidence", () => {
  assert.equal(
    assessEditorialLearning({
      ageDays: 14,
      searchArrivals: 6,
      touchpoints: 1,
      leadTouchpoints: 0,
      publicationViews: 20,
    }).evidenceLevel,
    "emerging",
  );
  assert.equal(
    assessEditorialLearning({
      ageDays: 21,
      searchArrivals: 22,
      touchpoints: 4,
      leadTouchpoints: 1,
      publicationViews: 80,
    }).evidenceLevel,
    "measured",
  );
});

test("extracts stable publication attribution from Content Studio tags", () => {
  const tags = [
    "website",
    "cms:magasin",
    "slug:finestrat-samme-pris",
    "nexus-editorial-signal",
    "nexus-opportunity:11111111-1111-1111-1111-111111111111",
    "nexus-angle:same_price_area_gap",
  ];
  assert.equal(articlePathFromTags(tags), "/magasin/finestrat-samme-pris");
  assert.equal(
    nexusOpportunityIdFromTags(tags),
    "11111111-1111-1111-1111-111111111111",
  );
  assert.equal(nexusAngleFromTags(tags), "same_price_area_gap");
});
