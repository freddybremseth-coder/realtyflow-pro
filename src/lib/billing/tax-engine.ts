import type { BillingCustomer, BillingTaxRule } from "@/lib/billing/types";

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR",
  "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
]);

export function billingCustomerRegion(sellerCountry: string, customerCountry: string) {
  const seller = sellerCountry.toUpperCase();
  const customer = customerCountry.toUpperCase();
  if (seller === customer) return "domestic" as const;
  if (EU_COUNTRIES.has(customer)) return "eu" as const;
  return "outside_eu" as const;
}

export function resolveBillingTaxRule(params: {
  sellerCountry: string;
  customer: Pick<BillingCustomer, "country_code" | "customer_type" | "vat_number" | "vies_status">;
  supplyType: "goods" | "service";
  rules: BillingTaxRule[];
  onDate?: string;
}) {
  const onDate = params.onDate || new Date().toISOString().slice(0, 10);
  const seller = params.sellerCountry.toUpperCase();
  const customerCountry = params.customer.country_code.toUpperCase();
  const region = billingCustomerRegion(seller, customerCountry);

  const candidates = params.rules.filter((rule) => {
    if (!rule.active || rule.seller_country_code !== seller) return false;
    if (rule.valid_from > onDate || (rule.valid_to && rule.valid_to < onDate)) return false;
    if (rule.customer_country_code && rule.customer_country_code !== customerCountry) return false;
    if (rule.customer_region !== "any" && rule.customer_region !== region) return false;
    if (rule.customer_type !== "any" && rule.customer_type !== params.customer.customer_type) return false;
    if (rule.supply_type !== "any" && rule.supply_type !== params.supplyType) return false;
    if (rule.requires_vat_validation && (!params.customer.vat_number || params.customer.vies_status !== "valid")) return false;
    return true;
  });

  return candidates.sort((left, right) => {
    const leftSpecificity = Number(Boolean(left.customer_country_code)) + Number(left.customer_region !== "any") + Number(left.customer_type !== "any") + Number(left.supply_type !== "any");
    const rightSpecificity = Number(Boolean(right.customer_country_code)) + Number(right.customer_region !== "any") + Number(right.customer_type !== "any") + Number(right.supply_type !== "any");
    return rightSpecificity - leftSpecificity || left.priority - right.priority || left.name.localeCompare(right.name);
  })[0] || null;
}

export function taxRuleLegalText(rule: BillingTaxRule, language: "no" | "en" | "es") {
  if (rule.legal_texts?.[language]) return rule.legal_texts[language];
  if (rule.legal_texts?.en) return rule.legal_texts.en;
  if (rule.reverse_charge) return "Reverse charge";
  return rule.exemption_reason || null;
}
