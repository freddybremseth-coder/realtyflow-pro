import assert from "node:assert/strict";
import test from "node:test";
import { resolveBillingTaxRule, taxRuleLegalText } from "@/lib/billing/tax-engine";
import type { BillingTaxRule } from "@/lib/billing/types";

function rule(overrides: Partial<BillingTaxRule>): BillingTaxRule {
  return {
    id: crypto.randomUUID(), organization_id: crypto.randomUUID(), name: "Standard", seller_country_code: "ES",
    customer_country_code: null, customer_region: "any", customer_type: "any", supply_type: "any", rate: "21",
    reverse_charge: false, exempt: false, exemption_reason: null, legal_texts: {}, reporting_code: "TEST",
    requires_vat_validation: false, priority: 100, valid_from: "2026-01-01", valid_to: null, active: true,
    ...overrides,
  };
}

const euB2b = rule({
  name: "EU B2B service", customer_region: "eu", customer_type: "business", supply_type: "service", rate: "0",
  reverse_charge: true, requires_vat_validation: true, priority: 10, legal_texts: { en: "Reverse charge", es: "Inversión del sujeto pasivo" },
});
const domestic = rule({ name: "Spanish domestic", customer_region: "domestic", priority: 10 });

test("tax engine selects reverse charge only after valid VIES validation", () => {
  const baseCustomer = { country_code: "DE", customer_type: "business" as const, vat_number: "DE123", vies_status: "unchecked" as const };
  assert.equal(resolveBillingTaxRule({ sellerCountry: "ES", customer: baseCustomer, supplyType: "service", rules: [euB2b, domestic], onDate: "2026-07-18" }), null);
  const selected = resolveBillingTaxRule({ sellerCountry: "ES", customer: { ...baseCustomer, vies_status: "valid" }, supplyType: "service", rules: [euB2b, domestic], onDate: "2026-07-18" });
  assert.equal(selected?.id, euB2b.id);
  assert.equal(taxRuleLegalText(euB2b, "es"), "Inversión del sujeto pasivo");
});

test("tax engine selects the domestic rule for a Spanish customer", () => {
  const selected = resolveBillingTaxRule({ sellerCountry: "ES", customer: { country_code: "ES", customer_type: "private", vat_number: null, vies_status: "unchecked" }, supplyType: "service", rules: [euB2b, domestic], onDate: "2026-07-18" });
  assert.equal(selected?.id, domestic.id);
});

test("tax engine ignores expired and inactive rules", () => {
  const selected = resolveBillingTaxRule({ sellerCountry: "ES", customer: { country_code: "ES", customer_type: "private", vat_number: null, vies_status: "unchecked" }, supplyType: "service", rules: [rule({ valid_to: "2025-12-31" }), rule({ active: false })], onDate: "2026-07-18" });
  assert.equal(selected, null);
});
