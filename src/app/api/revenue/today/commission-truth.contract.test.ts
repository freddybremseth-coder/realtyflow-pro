import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("src/app/api/revenue/today/route.ts", "utf8");
const priority = readFileSync("src/lib/nexus-real-estate-priority.ts", "utf8");
const truth = readFileSync("src/lib/revenue/commission-truth.ts", "utf8");
const directReaders = readFileSync("src/lib/nexus-opportunity-direct-readers.ts", "utf8");

test("Revenue Today exposes transaction value and commission truth separately", () => {
  assert.match(route, /totalPipelineValue/);
  assert.match(route, /knownCommissionRevenue/);
  assert.match(route, /commissionKnownCount/);
  assert.match(route, /commissionUnknownCount/);
  assert.match(route, /commissionCoveragePct/);
  assert.match(route, /item\.transactionValue/);
  assert.match(route, /item\.commissionRevenue/);
});

test("canonical real-estate scoring neutralizes raw transaction value", () => {
  assert.match(priority, /pipeline_value: 0/);
  assert.match(priority, /value: truth\.transactionValue/);
  assert.match(priority, /commissionPriorityBonus\(truth\)/);
  assert.doesNotMatch(priority, /transactionValue\s*>?=\s*\d+/);
});

test("unknown commission remains unknown with no forecast fallback", () => {
  assert.match(truth, /commissionRevenue: null/);
  assert.match(truth, /source: "unknown"/);
  assert.doesNotMatch(truth, /0\.03|3\s*%|FALLBACK_COMMISSION/);
});

test("Nexus direct opportunity reader uses canonical commission-aware sorting", () => {
  assert.match(directReaders, /sortCanonicalRealEstatePriorities/);
  assert.doesNotMatch(directReaders, /sortRevenuePriorities/);
});
