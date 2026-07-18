import assert from "node:assert/strict";
import test from "node:test";
import { donaAnnaCommandSchema } from "@/lib/dona-anna/validation";

const productId = "10000000-0000-4000-8000-000000000001";
const warehouseId = "10000000-0000-4000-8000-000000000002";
const priceListId = "10000000-0000-4000-8000-000000000003";

test("accepts products, channel prices and zero-opening-stock adjustments", () => {
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "upsert_product",
    payload: { sku: "EVOO-500", name: "Doña Anna EVOO 500 ml", unitPrice: "18.90" },
  }).success, true);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "upsert_price_list",
    payload: {
      name: "Familieforhandler EUR", code: "family-eur", currency: "EUR",
      salesChannel: "family_reseller", customerType: "family_reseller",
    },
  }).success, true);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "set_price",
    payload: { productId, priceListId, unitPrice: "12.50", minimumQuantity: "6" },
  }).success, true);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "adjust_inventory",
    payload: { productId, warehouseId, quantity: "10", currency: "EUR", reason: "Første varemottak" },
  }).success, true);
});

test("accepts sales orders but rejects missing lines", () => {
  const base = {
    orderType: "sale",
    salesChannel: "website",
    currency: "EUR",
  };
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "create_order",
    payload: { ...base, lines: [{ productId, quantity: "2", unit: "flaske", unitPrice: "18.90" }] },
  }).success, true);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "create_order",
    payload: { ...base, lines: [] },
  }).success, false);
});

test("only implemented commission and landed-cost modes pass validation", () => {
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "upsert_commission_rule",
    payload: {
      name: "50 % margin", ruleType: "margin_percent", percentage: "50",
      payableEvent: "paid", appliesToChannel: "all",
    },
  }).success, true);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "upsert_commission_rule",
    payload: { name: "Ugyldig", ruleType: "reseller_price", payableEvent: "confirmed", appliesToChannel: "all" },
  }).success, false);
  assert.equal(donaAnnaCommandSchema.safeParse({
    command: "record_landed_cost",
    payload: {
      purchaseOrderId: productId, costType: "freight", amount: "100", currency: "EUR",
      allocationMethod: "manual",
    },
  }).success, false);
});
