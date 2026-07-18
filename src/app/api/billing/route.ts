import { NextRequest, NextResponse } from "next/server";
import { defaultBillingTaxRules } from "@/lib/billing/defaults";
import { requireBillingRequest, billingDatabaseError } from "@/lib/billing/request";
import { organizationInputSchema, validationMessage } from "@/lib/billing/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireBillingRequest(request, "read");
  if (!auth.value) return auth.response;
  const { context, supabase } = auth.value;

  let organizationIds: string[] | null = null;
  if (context.role !== "OWNER") {
    const { data: memberships, error } = await supabase
      .from("billing_organization_users")
      .select("organization_id")
      .eq("active", true)
      .ilike("user_email", context.email);
    if (error) return billingDatabaseError(error);
    organizationIds = (memberships || []).map((row) => row.organization_id);
  }

  let query = supabase.from("billing_organizations").select("*").eq("active", true).order("legal_name");
  if (organizationIds) {
    if (organizationIds.length === 0) return NextResponse.json({ organizations: [] });
    query = query.in("id", organizationIds);
  }
  const { data, error } = await query;
  if (error) return billingDatabaseError(error);
  return NextResponse.json({ organizations: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const { context, supabase } = auth.value;
  if (context.role !== "OWNER") return NextResponse.json({ error: "Bare eier kan opprette juridiske fakturafirmaer." }, { status: 403 });

  const parsed = organizationInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const { data: organization, error } = await supabase.from("billing_organizations").insert({
    slug: input.slug,
    legal_name: input.legalName,
    trading_name: input.tradingName || null,
    country_code: input.countryCode,
    registration_number: input.registrationNumber || null,
    vat_number: input.vatNumber || null,
    address_line_1: input.addressLine1 || null,
    address_line_2: input.addressLine2 || null,
    postal_code: input.postalCode || null,
    city: input.city || null,
    region: input.region || null,
    default_currency: input.defaultCurrency,
    default_language: input.defaultLanguage,
    email: input.email || null,
    phone: input.phone || null,
    website: input.website || null,
    iban: input.iban || null,
    bic: input.bic || null,
    payment_terms_days: input.paymentTermsDays,
    invoice_footer: input.invoiceFooter || null,
    created_by_email: context.email,
  }).select("*").single();
  if (error || !organization) {
    const status = error?.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error?.message || "Firmaet kunne ikke opprettes." }, { status });
  }

  const rollback = async (message: string) => {
    await supabase.from("billing_organizations").delete().eq("id", organization.id);
    return NextResponse.json({ error: message }, { status: 500 });
  };
  const { error: memberError } = await supabase.from("billing_organization_users").insert({
    organization_id: organization.id,
    user_email: context.email,
    role: "owner",
  });
  if (memberError) return rollback(memberError.message);
  const { error: settingsError } = await supabase.from("billing_organization_settings").insert({ organization_id: organization.id });
  if (settingsError) return rollback(settingsError.message);

  const taxRules = defaultBillingTaxRules(input.countryCode).map((rule) => ({
    organization_id: organization.id,
    ...rule,
    reverse_charge: Boolean(rule.reverse_charge),
    exempt: Boolean(rule.exempt),
    requires_vat_validation: Boolean(rule.requires_vat_validation),
    legal_texts: rule.legal_texts || {},
  }));
  const { error: taxError } = await supabase.from("billing_tax_rules").insert(taxRules);
  if (taxError) return rollback(taxError.message);
  await supabase.from("billing_audit_events").insert({
    organization_id: organization.id,
    actor_email: context.email,
    action: "billing_organization_created",
    resource_type: "billing_organization",
    resource_id: organization.id,
    metadata: { countryCode: input.countryCode, defaultCurrency: input.defaultCurrency },
  });
  return NextResponse.json({ organization }, { status: 201 });
}
