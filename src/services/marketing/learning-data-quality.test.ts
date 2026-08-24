import assert from "node:assert/strict";
import test from "node:test";
import { assessLocationLearningQuality } from "./learning-data-quality";

test("historical asset location conflict is quarantined", () => {
  assert.deepEqual(assessLocationLearningQuality("Altea", "Polop"), {
    learningEligible: false,
    reason: "historical_asset_location_conflict",
  });
});

test("same place is learning eligible despite case or accents", () => {
  assert.deepEqual(assessLocationLearningQuality("BALCÓN DE FINESTRAT", "Balcon de Finestrat"), {
    learningEligible: true,
    reason: null,
  });
});

test("region-only values do not create false conflict", () => {
  assert.deepEqual(assessLocationLearningQuality("Costa Blanca South", "Campoamor"), {
    learningEligible: true,
    reason: null,
  });
});

test("missing verified location does not quarantine historical metrics", () => {
  assert.deepEqual(assessLocationLearningQuality("Gran Alacant", null), {
    learningEligible: true,
    reason: null,
  });
});
