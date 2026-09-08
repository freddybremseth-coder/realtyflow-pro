import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/api/revenue/today/route.ts"), "utf8");

test("Revenue Today reads canonical portal event fields and applies recency scoring", () => {
  assert.match(source, /applyPortalRecencyBoost/);
  assert.match(source, /source_system,source_type/);
  assert.match(source, /revenueEvents: contactEvents/);
});

test("Phase 5C does not mutate contacts to simulate active-now", () => {
  assert.doesNotMatch(source, /from\("contacts"\)\.update/);
  assert.doesNotMatch(source, /contacts[\s\S]{0,120}updated_at[\s\S]{0,120}update\(/);
});
