/**
 * Proposal-only, deterministic commission settlement. Never initiate payments
 * from this helper. Inputs are integer euro cents, excluding VAT and refundable
 * taxes, and must refer to commission ACTUALLY received from a developer.
 *
 * The 7% developer commission is a per-deal contract attribute, not a fixed
 * multiplier used here: this function allocates the commission cash received.
 */
export type SharedCommissionInput = {
  developerCommissionReceivedCents: number;
  approvedDirectExpensesCents: number;
};
export type SharedCommissionAllocation = {
  developerCommissionReceivedCents: number;
  marketingReserveCents: number;
  approvedDirectExpensesCents: number;
  distributableCents: number;
  freddyShareCents: number;
  andreaShareCents: number;
  roundingHoldCents: number;
};

function cents(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${field} must be a nonnegative safe integer in euro cents`);
}

/**
 * Marketing is 10% of developer commission collected, NOT sale value or
 * commission remaining after travel. Eligible costs are reimbursed outside
 * the 50/50 split to the party that paid them, never twice.
 */
export function allocateSharedCommission(input: SharedCommissionInput): SharedCommissionAllocation {
  cents(input.developerCommissionReceivedCents, "developerCommissionReceivedCents");
  cents(input.approvedDirectExpensesCents, "approvedDirectExpensesCents");
  const receipt = input.developerCommissionReceivedCents;
  // Exact integer-cent half-up rounding for 10%, avoiding floating-point drift.
  const marketingReserveCents = Math.floor(receipt / 10) + (receipt % 10 >= 5 ? 1 : 0);
  const distributableCents =
    input.developerCommissionReceivedCents - marketingReserveCents - input.approvedDirectExpensesCents;
  if (distributableCents < 0)
    throw new RangeError("Approved costs exceed commission after the marketing reserve");
  const eachCents = Math.floor(distributableCents / 2);
  return {
    ...input,
    marketingReserveCents,
    approvedDirectExpensesCents: input.approvedDirectExpensesCents,
    distributableCents,
    freddyShareCents: eachCents,
    andreaShareCents: eachCents,
    roundingHoldCents: distributableCents - eachCents * 2,
  };
}
