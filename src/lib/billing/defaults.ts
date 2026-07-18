export type DefaultBillingTaxRule = {
  name: string;
  seller_country_code: string;
  customer_region: "any" | "domestic" | "eu" | "outside_eu";
  customer_type: "any" | "private" | "business" | "public";
  supply_type: "any" | "goods" | "service";
  rate: string;
  reverse_charge?: boolean;
  exempt?: boolean;
  exemption_reason?: string;
  legal_texts?: Record<string, string>;
  reporting_code: string;
  requires_vat_validation?: boolean;
  priority: number;
};

export function defaultBillingTaxRules(countryCode: string): DefaultBillingTaxRule[] {
  const country = countryCode.toUpperCase();
  if (country === "NO") {
    return [
      {
        name: "Norge innenlands – ordinær MVA",
        seller_country_code: "NO",
        customer_region: "domestic",
        customer_type: "any",
        supply_type: "any",
        rate: "25",
        reporting_code: "NO_STANDARD",
        priority: 10,
      },
      {
        name: "Norge til utenlandsk næringsdrivende – tjeneste",
        seller_country_code: "NO",
        customer_region: "outside_eu",
        customer_type: "business",
        supply_type: "service",
        rate: "0",
        exempt: true,
        exemption_reason: "Utenfor merverdiavgiftsområdet",
        legal_texts: { no: "Utenfor merverdiavgiftsområdet", en: "Outside the scope of Norwegian VAT" },
        reporting_code: "NO_EXPORT_SERVICE",
        priority: 20,
      },
      {
        name: "Norge til EU-næringsdrivende – tjeneste",
        seller_country_code: "NO",
        customer_region: "eu",
        customer_type: "business",
        supply_type: "service",
        rate: "0",
        exempt: true,
        legal_texts: { no: "Utenfor merverdiavgiftsområdet", en: "Outside the scope of Norwegian VAT" },
        reporting_code: "NO_EXPORT_SERVICE",
        priority: 20,
      },
    ];
  }
  if (country === "ES") {
    return [
      {
        name: "Spania innenlands – ordinær IVA",
        seller_country_code: "ES",
        customer_region: "domestic",
        customer_type: "any",
        supply_type: "any",
        rate: "21",
        reporting_code: "ES_STANDARD",
        priority: 10,
      },
      {
        name: "Spania til annet EU-land – B2B-tjeneste",
        seller_country_code: "ES",
        customer_region: "eu",
        customer_type: "business",
        supply_type: "service",
        rate: "0",
        reverse_charge: true,
        legal_texts: { no: "Omvendt avgiftsplikt – Reverse charge", en: "Reverse charge", es: "Inversión del sujeto pasivo" },
        reporting_code: "ES_EU_B2B_SERVICE",
        requires_vat_validation: true,
        priority: 10,
      },
      {
        name: "Spania til land utenfor EU – tjeneste",
        seller_country_code: "ES",
        customer_region: "outside_eu",
        customer_type: "business",
        supply_type: "service",
        rate: "0",
        exempt: true,
        exemption_reason: "Operación no sujeta a IVA español",
        legal_texts: { no: "Ikke avgiftspliktig i Spania", en: "Not subject to Spanish VAT", es: "Operación no sujeta a IVA español" },
        reporting_code: "ES_NON_EU_SERVICE",
        priority: 20,
      },
    ];
  }
  return [{
    name: `${country} – standard avgift`,
    seller_country_code: country,
    customer_region: "domestic",
    customer_type: "any",
    supply_type: "any",
    rate: "0",
    reporting_code: `${country}_STANDARD`,
    priority: 100,
  }];
}
