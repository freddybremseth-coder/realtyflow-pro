import assert from "node:assert/strict";
import test from "node:test";
import {
  canEvaluateForNurture,
  normalizeNurtureState,
  shouldPersistCompletedWhenIneligible,
} from "./nurture-state";

test("legacy active without sequence is only eligible, never enrolled", () => {
  assert.equal(normalizeNurtureState({ nurture_status: "active" }), "eligible");
  assert.equal(canEvaluateForNurture("eligible"), true);
});

test("legacy active with a real sequence remains enrolled", () => {
  assert.equal(normalizeNurtureState({ nurture_status: "active", nurture_sequence: "soleada-reactivation-v1" }), "enrolled");
  assert.equal(normalizeNurtureState({ nurture_status: "active", nurture_enrolled_at: "2026-08-01T10:00:00.000Z" }), "enrolled");
});

test("paused completed and stopped are not evaluated for automated nurture", () => {
  for (const state of ["paused", "completed", "stopped"] as const) {
    assert.equal(canEvaluateForNurture(state), false);
  }
});

test("only an actually enrolled contact is auto-completed when pipeline becomes ineligible", () => {
  assert.equal(shouldPersistCompletedWhenIneligible("enrolled"), true);
  assert.equal(shouldPersistCompletedWhenIneligible("eligible"), false);
});

test("explicit opt-out aliases normalize to stopped", () => {
  assert.equal(normalizeNurtureState({ nurture_status: "unsubscribed" }), "stopped");
  assert.equal(normalizeNurtureState({ nurture_status: "opted_out" }), "stopped");
});
