import assert from "node:assert/strict";
import test from "node:test";
import { buildBuyerProfileDiscoveryPriority } from "./buyer-profile-discovery-priority";

function input(overrides: Record<string, unknown> = {}) {
  return {
    pipelineStatus: "QUALIFIED",
    pipelineValue: 450000,
    personaConfidence: 91,
    projectedCompletenessScore: 57,
    projectedMissing: ["Kjøpstidslinje", "Budsjett", "Boligtype", "Soverom"],
    evidenceConflictCount: 0,
    ...overrides,
  };
}

test("QUALIFIED discovery chooses purchase timeline before other missing profile fields", () => {
  const decision = buildBuyerProfileDiscoveryPriority(input());
  assert.equal(decision.field, "purchase_timeline");
  assert.equal(decision.requiresCustomerInput, true);
  assert.equal(decision.readOnly, true);
});

test("VIEWING with missing next follow-up prioritizes operational follow-up first", () => {
  const decision = buildBuyerProfileDiscoveryPriority(input({
    pipelineStatus: "VIEWING",
    projectedCompletenessScore: 86,
    projectedMissing: ["Neste oppfølging", "Kjøpstidslinje"],
  }));
  assert.equal(decision.field, "next_followup");
  assert.equal(decision.priority, "CRITICAL");
});

test("VIEWING outranks equivalent QUALIFIED lead", () => {
  const viewing = buildBuyerProfileDiscoveryPriority(input({ pipelineStatus: "VIEWING" }));
  const qualified = buildBuyerProfileDiscoveryPriority(input({ pipelineStatus: "QUALIFIED" }));
  assert.ok(viewing.score > qualified.score);
});

test("higher projected completeness and pipeline value increase priority without auto execution", () => {
  const strong = buildBuyerProfileDiscoveryPriority(input({
    pipelineValue: 900000,
    projectedCompletenessScore: 86,
    personaConfidence: 95,
  }));
  const weak = buildBuyerProfileDiscoveryPriority(input({
    pipelineValue: 0,
    projectedCompletenessScore: 29,
    personaConfidence: 60,
  }));
  assert.ok(strong.score > weak.score);
  assert.equal(strong.readOnly, true);
});

test("evidence conflicts increase review priority but do not create an executor", () => {
  const withoutConflict = buildBuyerProfileDiscoveryPriority(input({ evidenceConflictCount: 0 }));
  const withConflict = buildBuyerProfileDiscoveryPriority(input({ evidenceConflictCount: 2 }));
  assert.ok(withConflict.score > withoutConflict.score);
  assert.equal(withConflict.requiresCustomerInput, true);
  assert.equal(withConflict.readOnly, true);
});

test("projected complete profile needs no discovery", () => {
  const decision = buildBuyerProfileDiscoveryPriority(input({
    projectedCompletenessScore: 100,
    projectedMissing: [],
  }));
  assert.equal(decision.field, null);
  assert.equal(decision.score, 0);
  assert.equal(decision.requiresCustomerInput, false);
  assert.equal(decision.priority, "LOW");
});
