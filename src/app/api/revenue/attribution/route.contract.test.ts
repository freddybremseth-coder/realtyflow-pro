import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("src/app/api/revenue/attribution/route.ts", "utf8");

test("attribution GET loads canonical touchpoints without weakening the admin gate", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /from\("marketing_touchpoints"\)/);
  assert.match(source, /buildCanonicalLeadAttribution/);
  assert.match(source, /marketingTouchpointFromRow/);
});

test("canonical attribution is scoped by brand and degrades with a visible warning", () => {
  assert.match(source, /scope !== "all"/);
  assert.match(source, /\.eq\("brand_id", scope\)/);
  assert.match(source, /Canonical touchpoints kunne ikke hentes/);
});

test("attribution GET remains read-only for canonical touchpoints", () => {
  const getBody = source.split("export async function POST")[0];
  assert.doesNotMatch(getBody, /marketing_touchpoints"\)\.insert/);
  assert.doesNotMatch(getBody, /marketing_touchpoints"\)\.update/);
  assert.doesNotMatch(getBody, /marketing_touchpoints"\)\.upsert/);
});
