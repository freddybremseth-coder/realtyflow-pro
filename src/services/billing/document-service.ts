import "server-only";
import type { BillingSupabaseClient } from "@/lib/billing/supabase";
import type { BillingCustomer, BillingLineInput, BillingProduct, BillingTaxRule } from "@/lib/billing/types";
import { resolveBillingTaxRule, taxRuleLegalText } from "@/lib/billing/tax-engine";

export async function normalizeBillingLinesForSave(params: {
  supabase: BillingSupabaseClient;
  organizationId: string;
  customerId: string;
  lines: BillingLineInput[];
}) {
  const productIds = Array.from(new Set(params.lines.map((line) => line.productId).filter(Boolean))) as string[];
  const [customerResult, rulesResult, productsResult] = await Promise.all([
    params.supabase.from("billing_customers").select("*").eq("id", params.customerId).eq("organization_id", params.organizationId).single(),
    params.supabase.from("billing_tax_rules").select("*").eq("organization_id", params.organizationId).eq("active", true),
    productIds.length
      ? params.supabase.from("billing_products").select("*").eq("organization_id", params.organizationId).in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (customerResult.error || !customerResult.data) throw new Error(customerResult.error?.message || "Kunden finnes ikke i valgt firma.");
  if (rulesResult.error) throw new Error(rulesResult.error.message);
  if (productsResult.error) throw new Error(productsResult.error.message);
  const customer = customerResult.data as BillingCustomer;
  const rules = (rulesResult.data || []) as BillingTaxRule[];
  const products = new Map(((productsResult.data || []) as BillingProduct[]).map((product) => [product.id, product]));

  return params.lines.map((line, index) => {
    if (!line.taxRuleId) throw new Error(`Velg avgiftsregel på linje ${index + 1}.`);
    const rule = rules.find((candidate) => candidate.id === line.taxRuleId);
    if (!rule) throw new Error(`Avgiftsregelen på linje ${index + 1} finnes ikke i valgt firma.`);
    const product = line.productId ? products.get(line.productId) : null;
    if (line.productId && !product) throw new Error(`Produktet på linje ${index + 1} finnes ikke i valgt firma.`);
    const eligible = resolveBillingTaxRule({
      sellerCountry: rule.seller_country_code,
      customer,
      supplyType: product?.supply_type || "service",
      rules: [rule],
    });
    if (!eligible) {
      const viesHint = rule.requires_vat_validation ? " Gyldig VIES-kontroll er påkrevd." : "";
      throw new Error(`Avgiftsregelen «${rule.name}» passer ikke kunden eller leveransen på linje ${index + 1}.${viesHint}`);
    }
    return {
      ...line,
      productId: product?.id || null,
      taxRuleId: rule.id,
      taxRate: String(rule.rate),
      taxLabel: rule.name,
      legalText: taxRuleLegalText(rule, customer.language),
    };
  });
}

export async function loadBillingDocumentBundle(supabase: BillingSupabaseClient, documentId: string) {
  const { data: document, error } = await supabase
    .from("billing_documents")
    .select("*,billing_customers(*)")
    .eq("id", documentId)
    .single();
  if (error || !document) throw new Error(error?.message || "Dokumentet finnes ikke.");
  const [linesResult, organizationResult, settingsResult, snapshotResult, creditAllocationsResult, refundAllocationsResult] = await Promise.all([
    supabase.from("billing_document_lines").select("*").eq("document_id", documentId).order("position"),
    supabase.from("billing_organizations").select("*").eq("id", document.organization_id).single(),
    supabase.from("billing_organization_settings").select("*").eq("organization_id", document.organization_id).maybeSingle(),
    supabase.from("billing_document_snapshots").select("*").eq("document_id", documentId).maybeSingle(),
    supabase
      .from("billing_credit_allocations")
      .select("*,credit_note:billing_documents!billing_credit_allocations_credit_note_id_fkey(id,document_number,issue_date,status)")
      .or(`original_invoice_id.eq.${documentId},credit_note_id.eq.${documentId}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("billing_refund_allocations")
      .select("*,billing_refunds(*)")
      .eq("original_invoice_id", documentId)
      .order("created_at", { ascending: false }),
  ]);
  const failure = [linesResult, organizationResult, settingsResult, snapshotResult, creditAllocationsResult, refundAllocationsResult].find((result) => result.error);
  if (failure?.error) throw new Error(failure.error.message);
  return {
    document,
    customer: document.billing_customers,
    organization: organizationResult.data,
    settings: settingsResult.data,
    lines: linesResult.data || [],
    snapshot: snapshotResult.data || null,
    creditAllocations: creditAllocationsResult.data || [],
    refundAllocations: refundAllocationsResult.data || [],
  };
}

export function copyDocumentPayload(document: Record<string, any>, overrides: Record<string, unknown> = {}) {
  return {
    originalDocumentId: document.original_document_id || "",
    issueDate: document.issue_date || "",
    deliveryDate: document.delivery_date || "",
    dueDate: document.due_date || "",
    validUntil: document.valid_until || "",
    currency: document.currency,
    accountingCurrency: document.accounting_currency,
    exchangeRate: String(document.exchange_rate || "1"),
    exchangeRateDate: document.exchange_rate_date || "",
    exchangeRateSource: document.exchange_rate_source || "",
    customerReference: document.customer_reference || "",
    projectReference: document.project_reference || "",
    orderReference: document.order_reference || "",
    contractReference: document.contract_reference || "",
    paymentTerms: document.payment_terms || "",
    notes: document.notes || "",
    rectificationReason: document.rectification_reason || "",
    ...overrides,
  };
}

export function copyDocumentLines(lines: Array<Record<string, any>>) {
  return lines.map((line) => ({
    productId: line.product_id || null,
    description: line.description,
    quantity: String(line.quantity),
    unit: line.unit,
    unitPrice: String(line.unit_price),
    discountPercent: String(line.discount_percent),
    taxRuleId: line.tax_rule_id,
    taxRate: String(line.tax_rate),
    taxLabel: line.tax_label,
    legalText: line.legal_text,
  }));
}
