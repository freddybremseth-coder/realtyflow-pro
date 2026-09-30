import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/cron/property-content-learning/route.ts", "utf8");

test("property content learning remains observe-only and uses exact attribution", () => {
  assert.match(source, /requireCronApi/);
  assert.match(source, /evaluateCronSafeMode/);
  assert.match(source, /exact_path_or_publication_only/);
  assert.match(source, /scoring_effect:\s*"none_observe_only"/);
  assert.match(source, /property_content_learning_snapshots/);
  assert.doesNotMatch(source, /property_content_opportunities"\)\s*\.update\(\{\s*score/);
});
