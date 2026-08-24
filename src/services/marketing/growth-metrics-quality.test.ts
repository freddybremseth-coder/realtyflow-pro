import assert from "node:assert/strict";
import test from "node:test";
import { historicalAssetLearningQuality } from "./growth-metrics-sync";

test("quarantines an unsourced modern property claim", () => {
  const result = historicalAssetLearningQuality({
    caption: "En moderne villa med 3 soverom.",
    facts: [{ claim: "Boligtype: Villa", source: "Inventory N1" }],
    assetLocation: "Campoamor",
    verifiedLocation: "Campoamor",
  });
  assert.equal(result.learningEligible, false);
  assert.deepEqual(result.dataQualityReasons, ["historical_asset_unsupported_claim"]);
  assert.ok(result.unsupportedClaims.includes("modern property"));
});

test("keeps sourced modern wording learning-eligible", () => {
  const result = historicalAssetLearningQuality({
    caption: "En moderne villa i Balcón de Finestrat.",
    facts: [{ claim: "Tittel: MODERNE VILLA I BALCÓN DE FINESTRAT", source: "Inventory N5798" }],
    assetLocation: "Balcón de Finestrat",
    verifiedLocation: "Balcón de Finestrat",
  });
  assert.equal(result.learningEligible, true);
  assert.deepEqual(result.dataQualityReasons, []);
  assert.deepEqual(result.unsupportedClaims, []);
});

test("energy rating alone does not support energy-efficient wording", () => {
  const result = historicalAssetLearningQuality({
    caption: "Boligen er moderne og energieffektiv.",
    facts: [{ claim: "Energimerking: B", source: "Inventory N5844" }],
    assetLocation: "Los Balcones",
    verifiedLocation: "Los Balcones",
  });
  assert.equal(result.learningEligible, false);
  assert.ok(result.unsupportedClaims.includes("energy-efficient property"));
});

test("records both location conflict and unsupported claim", () => {
  const result = historicalAssetLearningQuality({
    caption: "Disse moderne villaene ligger i Polop.",
    facts: [{ claim: "Sted: Altea", source: "Historical asset" }],
    assetLocation: "Altea",
    verifiedLocation: "Polop",
  });
  assert.equal(result.learningEligible, false);
  assert.deepEqual(result.dataQualityReasons, [
    "historical_asset_location_conflict",
    "historical_asset_unsupported_claim",
  ]);
  assert.equal(result.dataQualityReason, "historical_asset_location_conflict");
});
