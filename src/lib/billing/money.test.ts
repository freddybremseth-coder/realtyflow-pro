import assert from "node:assert/strict";
import test from "node:test";
import { addDecimalAmounts, calculateBillingTotals, minorUnitsToDecimal, parseDecimal } from "@/lib/billing/money";

test("billing totals use decimal half-up rounding without floating point drift", () => {
  const result = calculateBillingTotals([
    { description: "Rådgivning", quantity: "3", unit: "time", unitPrice: "19.99", discountPercent: "10", taxRate: "21" },
  ]);
  assert.deepEqual(result.lines[0], {
    subtotal: "59.97",
    discount: "6.00",
    net: "53.97",
    tax: "11.33",
    total: "65.30",
  });
  assert.equal(result.total, "65.30");
});

test("billing rounds a half cent up consistently", () => {
  const result = calculateBillingTotals([
    { description: "Avrunding", quantity: "1", unit: "stk", unitPrice: "0.005", discountPercent: "0", taxRate: "0" },
  ]);
  assert.equal(result.total, "0.01");
});

test("billing keeps exact cents when combining currencies separately", () => {
  assert.equal(addDecimalAmounts(["0.10", "0.20", "19.99"]), "20.29");
  assert.equal(minorUnitsToDecimal(parseDecimal("1234.567", 2)), "1234.57");
});

test("billing rejects negative prices and invalid percentages", () => {
  assert.throws(() => calculateBillingTotals([{ description: "Feil", quantity: "1", unit: "stk", unitPrice: "-1", discountPercent: "0", taxRate: "25" }]));
  assert.throws(() => calculateBillingTotals([{ description: "Feil", quantity: "1", unit: "stk", unitPrice: "1", discountPercent: "101", taxRate: "25" }]));
});
