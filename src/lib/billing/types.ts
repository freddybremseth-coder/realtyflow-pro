export const BILLING_DOCUMENT_TYPES = ["quote", "proforma", "invoice", "credit_note"] as const;
export type BillingDocumentType = (typeof BILLING_DOCUMENT_TYPES)[number];

export const BILLING_DOCUMENT_STATUSES = [
  "draft",
  "ready",
  "issued",
  "sent",
  "opened",
  "partially_paid",
  "paid",
  "overdue",
  "credited",
  "replaced",
] as const;
export type BillingDocumentStatus = (typeof BILLING_DOCUMENT_STATUSES)[number];

export type BillingOrganization = {
  id: string;
  slug: string;
  legal_name: string;
  trading_name: string | null;
  country_code: string;
  registration_number: string | null;
  vat_number: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  default_currency: string;
  default_language: "no" | "en" | "es";
  email: string | null;
  phone: string | null;
  website: string | null;
  logo_path: string | null;
  iban: string | null;
  bic: string | null;
  payment_terms_days: number;
  invoice_footer: string | null;
  active: boolean;
};

export type BillingCustomer = {
  id: string;
  organization_id: string;
  name: string;
  customer_type: "private" | "business" | "public";
  organization_number: string | null;
  vat_number: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_postal_code: string | null;
  billing_city: string | null;
  billing_region: string | null;
  country_code: string;
  language: "no" | "en" | "es";
  currency: string;
  email: string | null;
  phone: string | null;
  contact_person: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  vies_status: "unchecked" | "valid" | "invalid" | "unavailable";
  vies_checked_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type BillingProduct = {
  id: string;
  organization_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  supply_type: "goods" | "service";
  unit: string;
  unit_price: string;
  currency: string;
  default_tax_rule_id: string | null;
  active: boolean;
};

export type BillingTaxRule = {
  id: string;
  organization_id: string;
  name: string;
  seller_country_code: string;
  customer_country_code: string | null;
  customer_region: "any" | "domestic" | "eu" | "outside_eu";
  customer_type: "any" | "private" | "business" | "public";
  supply_type: "any" | "goods" | "service";
  rate: string;
  reverse_charge: boolean;
  exempt: boolean;
  exemption_reason: string | null;
  legal_texts: Record<string, string>;
  reporting_code: string | null;
  requires_vat_validation: boolean;
  priority: number;
  valid_from: string;
  valid_to: string | null;
  active: boolean;
};

export type BillingLineInput = {
  productId?: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  taxRuleId?: string | null;
  taxRate: string;
  taxLabel?: string | null;
  legalText?: string | null;
};

export type BillingDocument = {
  id: string;
  organization_id: string;
  document_type: BillingDocumentType;
  status: BillingDocumentStatus;
  document_number: string | null;
  customer_id: string;
  original_document_id: string | null;
  issue_date: string | null;
  delivery_date: string | null;
  due_date: string | null;
  valid_until: string | null;
  currency: string;
  accounting_currency: string;
  exchange_rate: string;
  exchange_rate_date: string | null;
  exchange_rate_source: string | null;
  customer_reference: string | null;
  project_reference: string | null;
  order_reference: string | null;
  contract_reference: string | null;
  payment_terms: string | null;
  notes: string | null;
  rectification_reason: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total: string;
  accounting_total: string;
  amount_paid: string;
  balance: string;
  snapshot_hash: string | null;
  locked_at: string | null;
  sent_at: string | null;
  paid_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  billing_customers?: Pick<BillingCustomer, "id" | "name" | "email" | "country_code" | "vat_number"> | null;
};

export type BillingDocumentLine = {
  id: string;
  document_id: string;
  position: number;
  product_id: string | null;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount_percent: string;
  tax_rule_id: string | null;
  tax_rate: string;
  tax_label: string | null;
  legal_text: string | null;
  line_subtotal: string;
  line_discount: string;
  line_net: string;
  line_tax: string;
  line_total: string;
};

export type BillingTotals = {
  subtotal: string;
  discountTotal: string;
  netTotal: string;
  taxTotal: string;
  total: string;
  lines: Array<{
    subtotal: string;
    discount: string;
    net: string;
    tax: string;
    total: string;
  }>;
};
