import { NextRequest, NextResponse } from "next/server";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { customerInputSchema, validationMessage } from "@/lib/billing/validation";

export async function POST(request: NextRequest) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = customerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const denied = await requireBillingOrganization(auth.value, input.organizationId, true);
  if (denied) return denied;
  const row = {
    organization_id: input.organizationId,
    name: input.name,
    customer_type: input.customerType,
    organization_number: input.organizationNumber || null,
    vat_number: input.vatNumber || null,
    billing_address_line_1: input.billingAddressLine1 || null,
    billing_address_line_2: input.billingAddressLine2 || null,
    billing_postal_code: input.billingPostalCode || null,
    billing_city: input.billingCity || null,
    billing_region: input.billingRegion || null,
    country_code: input.countryCode,
    language: input.language,
    currency: input.currency,
    email: input.email || null,
    phone: input.phone || null,
    contact_person: input.contactPerson || null,
    payment_terms_days: input.paymentTermsDays ?? null,
    notes: input.notes || null,
  };
  const query = input.id
    ? auth.value.supabase.from("billing_customers").update(row).eq("id", input.id).eq("organization_id", input.organizationId)
    : auth.value.supabase.from("billing_customers").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) return billingDatabaseError(error);
  await auth.value.supabase.from("billing_audit_events").insert({
    organization_id: input.organizationId,
    actor_email: auth.value.context.email,
    action: input.id ? "customer_updated" : "customer_created",
    resource_type: "billing_customer",
    resource_id: data.id,
  });
  return NextResponse.json({ customer: data }, { status: input.id ? 200 : 201 });
}
