import { NextRequest, NextResponse } from "next/server";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { productInputSchema, validationMessage } from "@/lib/billing/validation";

export async function POST(request: NextRequest) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = productInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const denied = await requireBillingOrganization(auth.value, input.organizationId, true);
  if (denied) return denied;
  const row = {
    organization_id: input.organizationId,
    sku: input.sku || null,
    name: input.name,
    description: input.description || null,
    supply_type: input.supplyType,
    unit: input.unit,
    unit_price: input.unitPrice,
    currency: input.currency,
    default_tax_rule_id: input.defaultTaxRuleId || null,
  };
  const query = input.id
    ? auth.value.supabase.from("billing_products").update(row).eq("id", input.id).eq("organization_id", input.organizationId)
    : auth.value.supabase.from("billing_products").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) return billingDatabaseError(error);
  return NextResponse.json({ product: data }, { status: input.id ? 200 : 201 });
}
