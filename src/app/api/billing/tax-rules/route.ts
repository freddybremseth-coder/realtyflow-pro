import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { billingDatabaseError, requireBillingOrganization, requireBillingRequest } from "@/lib/billing/request";
import { validationMessage } from "@/lib/billing/validation";

const schema = z.object({
  organizationId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(200),
  sellerCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  customerCountryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional().nullable().or(z.literal("")),
  customerRegion: z.enum(["any", "domestic", "eu", "outside_eu"]),
  customerType: z.enum(["any", "private", "business", "public"]),
  supplyType: z.enum(["any", "goods", "service"]),
  rate: z.union([z.string(), z.number()]).transform(String),
  reverseCharge: z.boolean().default(false),
  exempt: z.boolean().default(false),
  exemptionReason: z.string().trim().max(1000).optional().nullable(),
  legalTexts: z.record(z.string(), z.string()).default({}),
  reportingCode: z.string().trim().max(120).optional().nullable(),
  requiresVatValidation: z.boolean().default(false),
  priority: z.coerce.number().int().min(0).max(10000).default(100),
  validFrom: z.string().date(),
  validTo: z.string().date().optional().nullable().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const auth = await requireBillingRequest(request, "write");
  if (!auth.value) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  const input = parsed.data;
  const denied = await requireBillingOrganization(auth.value, input.organizationId, true);
  if (denied) return denied;
  const rate = Number(input.rate.replace(",", "."));
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return NextResponse.json({ error: "Avgiftssats må være mellom 0 og 100." }, { status: 400 });
  if ((input.reverseCharge || input.exempt) && rate !== 0) return NextResponse.json({ error: "Reverse charge og fritak må ha 0 % sats." }, { status: 400 });
  const row = {
    organization_id: input.organizationId,
    name: input.name,
    seller_country_code: input.sellerCountryCode,
    customer_country_code: input.customerCountryCode || null,
    customer_region: input.customerRegion,
    customer_type: input.customerType,
    supply_type: input.supplyType,
    rate: input.rate,
    reverse_charge: input.reverseCharge,
    exempt: input.exempt,
    exemption_reason: input.exemptionReason || null,
    legal_texts: input.legalTexts,
    reporting_code: input.reportingCode || null,
    requires_vat_validation: input.requiresVatValidation,
    priority: input.priority,
    valid_from: input.validFrom,
    valid_to: input.validTo || null,
  };
  const query = input.id
    ? auth.value.supabase.from("billing_tax_rules").update(row).eq("id", input.id).eq("organization_id", input.organizationId)
    : auth.value.supabase.from("billing_tax_rules").insert(row);
  const { data, error } = await query.select("*").single();
  if (error) return billingDatabaseError(error);
  return NextResponse.json({ taxRule: data }, { status: input.id ? 200 : 201 });
}
