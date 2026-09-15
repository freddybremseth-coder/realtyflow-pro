import assert from "node:assert/strict";
import test from "node:test";
import { commissionPriorityBonus, deriveCommissionTruth } from "./commission-truth";

test("explicit commission amount is canonical revenue truth", () => {
  const truth = deriveCommissionTruth({
    pipeline_value: 500_000,
    commission_amount: 42_000,
    commission_percent: 7,
  });
  assert.equal(truth.transactionValue, 500_000);
  assert.equal(truth.commissionRevenue, 42_000);
  assert.equal(truth.commissionPercent, 7);
  assert.equal(truth.commissionKnown, true);
  assert.equal(truth.source, "explicit_amount");
});

test("explicit rate derives commission only when transaction value exists", () => {
  const truth = deriveCommissionTruth({ pipeline_value: 400_000, commission_percent: 6 });
  assert.equal(truth.commissionRevenue, 24_000);
  assert.equal(truth.source, "explicit_rate");
  assert.equal(truth.commissionKnown, true);
});

test("missing commission stays unknown and never receives a 3 percent fallback", () => {
  const truth = deriveCommissionTruth({ pipeline_value: 900_000 });
  assert.equal(truth.transactionValue, 900_000);
  assert.equal(truth.commissionRevenue, null);
  assert.equal(truth.commissionPercent, null);
  assert.equal(truth.commissionKnown, false);
  assert.equal(truth.source, "unknown");
  assert.equal(commissionPriorityBonus(truth), 0);
});

test("commission priority bonus is based on our revenue, not property price", () => {
  const known = deriveCommissionTruth({ pipeline_value: 350_000, commission_percent: 10 });
  const unknownExpensive = deriveCommissionTruth({ pipeline_value: 1_200_000 });
  assert.ok(commissionPriorityBonus(known) > commissionPriorityBonus(unknownExpensive));
});
