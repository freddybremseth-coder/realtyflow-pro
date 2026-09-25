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

/** Itemised, owner-reviewed expenses: no marketing-reserve spending in this list. */
export type SharedDealCost = {
  id: string;
  kind: "fuel" | "parking" | "toll" | "customer_meeting" | "other_direct";
  amountCents: number;
  paidBy: "freddy" | "andrea" | "business";
  receiptReference: string;
  approved: boolean;
};
export type ItemisedSharedCommissionAllocation = SharedCommissionAllocation & {
  freddyExpenseReimbursementCents: number;
  andreaExpenseReimbursementCents: number;
  businessPaidExpenseCents: number;
};

export function allocateItemisedSharedCommission(
  developerCommissionReceivedCents: number,
  expenses: SharedDealCost[],
): ItemisedSharedCommissionAllocation {
  if (!Array.isArray(expenses) || expenses.length > 100)
    throw new RangeError("Expense list must contain no more than 100 approved items");
  const seenIds = new Set<string>();
  const seenReceipts = new Set<string>();
  let freddy = 0;
  let andrea = 0;
  let business = 0;
  for (const cost of expenses) {
    if (!cost || !["fuel", "parking", "toll", "customer_meeting", "other_direct"].includes(cost.kind))
      throw new RangeError("Only direct sale-related costs are allowed, never ad spending or general overhead");
    cents(cost.amountCents, "expense.amountCents");
    const id = typeof cost.id === "string" ? cost.id.trim() : "";
    const receipt = typeof cost.receiptReference === "string" ? cost.receiptReference.trim() : "";
    if (!cost.approved || !id || !receipt || seenIds.has(id) || seenReceipts.has(receipt.toLowerCase()))
      throw new RangeError("Expenses must be approved with unique IDs and receipt references");
    seenIds.add(id);
    seenReceipts.add(receipt.toLowerCase());
    if (cost.paidBy === "freddy") freddy += cost.amountCents;
    else if (cost.paidBy === "andrea") andrea += cost.amountCents;
    else if (cost.paidBy === "business") business += cost.amountCents;
    else throw new RangeError("Unknown expense payer");
  }
  const approvedDirectExpensesCents = freddy + andrea + business;
  cents(approvedDirectExpensesCents, "approvedDirectExpensesCents");
  const allocation = allocateSharedCommission({
    developerCommissionReceivedCents,
    approvedDirectExpensesCents,
  });
  return {
    ...allocation,
    freddyExpenseReimbursementCents: freddy,
    andreaExpenseReimbursementCents: andrea,
    businessPaidExpenseCents: business,
  };
}
