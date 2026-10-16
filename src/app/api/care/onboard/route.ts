import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROPERTY_TYPES = new Set(["apartment", "townhouse", "villa", "finca"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const workItemId = clean(body.workItemId, 80);
  const contactId = clean(body.contactId, 80);
  const propertyType = clean(body.propertyType, 40).toLowerCase();
  const propertyName = clean(body.propertyName, 160);
  const addressLine = clean(body.addressLine, 240);
  const municipality = clean(body.municipality, 120);
  const postcode = clean(body.postcode, 24);
  const requestedPlanId = clean(body.planId, 80);
  const startsOn = clean(body.startsOn, 10) || new Date().toISOString().slice(0, 10);
  const billingDay = Math.round(Number(body.billingDay || 1));

  if (!UUID.test(workItemId) || !UUID.test(contactId)) {
    return NextResponse.json({ error: "Ugyldig Care-lead eller kontakt." }, { status: 400 });
  }
  if (!PROPERTY_TYPES.has(propertyType)) {
    return NextResponse.json({ error: "Velg en gyldig boligtype." }, { status: 400 });
  }
  if (!addressLine || !municipality) {
    return NextResponse.json({ error: "Adresse og kommune er påkrevd." }, { status: 400 });
  }
  if (requestedPlanId && !UUID.test(requestedPlanId)) {
    return NextResponse.json({ error: "Ugyldig Care-plan." }, { status: 400 });
  }

  const { data: acceptedQuote, error: quoteError } = await supabase
    .schema("care")
    .from("kh_quotes")
    .select("id,plan_id,status")
    .eq("work_item_id", workItemId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (quoteError && !/relation .*kh_quotes.*does not exist/i.test(String(quoteError.message || ""))) {
    return NextResponse.json({ error: quoteError.message }, { status: 400 });
  }

  const acceptedQuotePlanId = acceptedQuote?.status === "accepted" && UUID.test(String(acceptedQuote.plan_id || ""))
    ? String(acceptedQuote.plan_id)
    : "";
  if (acceptedQuotePlanId && requestedPlanId && requestedPlanId !== acceptedQuotePlanId) {
    return NextResponse.json({ error: "Care-planen må samsvare med det aksepterte tilbudet." }, { status: 409 });
  }
  const planId = acceptedQuotePlanId || requestedPlanId;
  if (!validDate(startsOn)) {
    return NextResponse.json({ error: "Ugyldig startdato." }, { status: 400 });
  }
  if (!Number.isInteger(billingDay) || billingDay < 1 || billingDay > 28) {
    return NextResponse.json({ error: "Faktureringsdag må være mellom 1 og 28." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("care_onboard_lead", {
    p_work_item_id: workItemId,
    p_contact_id: contactId,
    p_property_type: propertyType,
    p_name: propertyName || null,
    p_address_line: addressLine,
    p_municipality: municipality,
    p_postcode: postcode || null,
    p_has_pool: booleanValue(body.hasPool),
    p_has_garden: booleanValue(body.hasGarden),
    p_plan_id: planId || null,
    p_starts_on: startsOn,
    p_billing_day: billingDay,
  });

  if (error) {
    const message = String(error.message || "Kunne ikke opprette Care-kunde.");
    const migrationMissing = /care_onboard_lead|schema cache|function .* does not exist/i.test(message);
    return NextResponse.json(
      { error: migrationMissing ? "Care-onboarding er ikke aktivert i databasen ennå." : message },
      { status: migrationMissing ? 503 : 400 },
    );
  }

  const onboarding = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const propertyId = clean(onboarding.property_id, 80);
  if (acceptedQuote?.id && UUID.test(propertyId)) {
    await supabase
      .schema("care")
      .from("kh_quotes")
      .update({ property_id: propertyId, updated_at: new Date().toISOString() })
      .eq("id", acceptedQuote.id);
  }

  return NextResponse.json({ success: true, onboarding: data });
}
