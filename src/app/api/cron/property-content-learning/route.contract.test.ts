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


test("existing Zen market articles are measured through unique dismissed coverage signals", () => {
  const signatures = Array.from(source.matchAll(/signature:\s*"([^"]+)"/g)).map(match => match[1]);
  const paths = Array.from(source.matchAll(/path:\s*"(\/magasin\/[^"]+)"/g)).map(match => match[1]);

  assert.equal(signatures.length, 9);
  assert.equal(new Set(signatures).size, 9);
  assert.equal(paths.length, 9);
  assert.equal(new Set(paths).size, 9);
  assert.match(source, /source:\s*"existing_market_article"/);
  assert.match(source, /legacyOpportunityRows/);
  assert.doesNotMatch(source, /property_content_opportunities"\)\s*\.update/);
});
