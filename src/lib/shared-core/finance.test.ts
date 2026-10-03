import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUSINESS_FINANCE_SOURCE_TYPES,
  FINANCE_SOURCE_BOUNDARIES,
  financeCurrency,
  financeDateOnly,
  financeEventDate,
  financeMoney,
  financialEventKey,
  isBookableFinancialEvent,
} from "@/lib/shared-core/finance";

test("Shared Core finance keeps Family behind the explicit Mondeo bridge", () => {
  assert.equal(BUSINESS_FINANCE_SOURCE_TYPES.includes("family_mondeo"), true);
  assert.equal(BUSINESS_FINANCE_SOURCE_TYPES.includes("family" as never), false);
  assert.equal(FINANCE_SOURCE_BOUNDARIES.family_mondeo.mode, "explicit-bridge");
  assert.equal(FINANCE_SOURCE_BOUNDARIES.family_mondeo.businessOnly, true);
});

test("Olivia is an explicit business bridge, not a parallel finance ledger", () => {
  assert.equal(FINANCE_SOURCE_BOUNDARIES.olivia.mode, "explicit-bridge");
  assert.match(FINANCE_SOURCE_BOUNDARIES.olivia.description, /harvest, subsidy and expense/i);
});

test("finance primitives normalize money, currency, dates and idempotency keys", () => {
  assert.equal(financeMoney("6007.50"), 6007.5);
  assert.equal(financeMoney("not-a-number"), 0);
  assert.equal(financeCurrency(" eur "), "EUR");
  assert.equal(financeDateOnly("2026-10-03T12:30:00Z"), "2026-10-03");
  assert.equal(financeEventDate(null, new Date("2026-10-03T10:00:00Z")), "2026-10-03");
  assert.equal(
    financialEventKey({ source_type: "olivia", source_id: "expense-1", stream: "olive_expense" }),
    "olivia:expense-1:olive_expense",
  );
});

test("only income/expense events that are not cancelled are bookable", () => {
  assert.equal(isBookableFinancialEvent({ direction: "income", status: "paid" }), true);
  assert.equal(isBookableFinancialEvent({ direction: "expense", status: "recognized" }), true);
  assert.equal(isBookableFinancialEvent({ direction: "metric", status: "recognized" }), false);
  assert.equal(isBookableFinancialEvent({ direction: "income", status: "cancelled" }), false);
});
