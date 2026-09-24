import assert from "node:assert/strict";
import test from "node:test";
import { allocateItemisedSharedCommission, allocateSharedCommission } from "./commission-sharing";

test("sale 500k at 7% developer commission: 10% marketing, direct costs, rest equal", () => {
  // Example only: sales price and 7% are used to derive actual commission
  // outside this allocation; expense payer is reimbursed separately.
  const settlement = allocateSharedCommission({
    developerCommissionReceivedCents: 3_500_000,
    approvedDirectExpensesCents: 150_000,
  });
  assert.deepEqual(settlement, {
    developerCommissionReceivedCents: 3_500_000,
    marketingReserveCents: 350_000,
    approvedDirectExpensesCents: 150_000,
    distributableCents: 3_000_000,
    freddyShareCents: 1_500_000,
    andreaShareCents: 1_500_000,
    roundingHoldCents: 0,
  });
});

test("never calculate 10% after travel; neither party receives reimbursement twice", () => {
  const result = allocateSharedCommission({
    developerCommissionReceivedCents: 100_000,
    approvedDirectExpensesCents: 20_000,
  });
  assert.equal(result.marketingReserveCents, 10_000);
  assert.equal(result.freddyShareCents, 35_000);
  assert.equal(result.andreaShareCents, 35_000);
  assert.equal(result.freddyShareCents + result.andreaShareCents +
    result.marketingReserveCents + result.approvedDirectExpensesCents + result.roundingHoldCents,
    result.developerCommissionReceivedCents);
});

test("cent rounding remains held, not secretly reallocated", () => {
  const result = allocateSharedCommission({
    developerCommissionReceivedCents: 101,
    approvedDirectExpensesCents: 0,
  });
  assert.equal(result.marketingReserveCents, 10);
  assert.equal(result.freddyShareCents, 45);
  assert.equal(result.andreaShareCents, 45);
  assert.equal(result.roundingHoldCents, 1);
});

test("no payout is proposed if marketing reserve and eligible expenses exceed receipts", () => {
  assert.throws(() => allocateSharedCommission({
    developerCommissionReceivedCents: 100,
    approvedDirectExpensesCents: 91,
  }), RangeError);
  for (const value of [-1, 1.1, Number.NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => allocateSharedCommission({
      developerCommissionReceivedCents: value, approvedDirectExpensesCents: 0,
    }), RangeError);
});

test("itemised fuel, parking and customer coffee reimburse the original payer before the equal split", () => {
  const allocation = allocateItemisedSharedCommission(3_500_000, [
    { id: "fuel-1", kind: "fuel", amountCents: 90_00, paidBy: "freddy", receiptReference: "fuel-receipt-1", approved: true },
    { id: "parking-1", kind: "parking", amountCents: 10_00, paidBy: "andrea", receiptReference: "parking-receipt-1", approved: true },
    { id: "cafe-1", kind: "customer_meeting", amountCents: 50_00, paidBy: "business", receiptReference: "cafe-receipt-1", approved: true },
  ]);
  assert.equal(allocation.marketingReserveCents, 350_000);
  assert.equal(allocation.approvedDirectExpensesCents, 15_000);
  assert.equal(allocation.freddyExpenseReimbursementCents, 9_000);
  assert.equal(allocation.andreaExpenseReimbursementCents, 1_000);
  assert.equal(allocation.businessPaidExpenseCents, 5_000);
  assert.equal(allocation.freddyShareCents, 1_567_500);
  assert.equal(allocation.andreaShareCents, 1_567_500);
  assert.equal(allocation.freddyShareCents + allocation.andreaShareCents +
    allocation.marketingReserveCents + allocation.approvedDirectExpensesCents + allocation.roundingHoldCents,
    allocation.developerCommissionReceivedCents);
});

test("itemised calculator refuses unapproved costs, duplicate receipts, ad spend and unknown payer", () => {
  const base = { id: "fuel", kind: "fuel" as const, amountCents: 100, paidBy: "freddy" as const,
    receiptReference: "receipt-1", approved: true };
  assert.throws(() => allocateItemisedSharedCommission(10000, [{ ...base, approved: false }]), RangeError);
  assert.throws(() => allocateItemisedSharedCommission(10000, [base, { ...base, id: "second" }]), RangeError);
  assert.throws(() => allocateItemisedSharedCommission(10000, [{ ...base, kind: "marketing" as never }]), RangeError);
  assert.throws(() => allocateItemisedSharedCommission(10000, [{ ...base, paidBy: "stranger" as never }]), RangeError);
  assert.throws(() => allocateItemisedSharedCommission(100, [{ ...base, amountCents: 100 }]), RangeError);
});
