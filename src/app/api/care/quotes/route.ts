import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["upsert", "mark_sent", "accept", "decline", "cancel"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime());
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function careIntentFrom(metadata: Record<string, unknown>) {
  const requestType = clean(metadata.request_type, 80).toLowerCase();
  return clean(metadata.service_intent, 80).toLowerCase()
    || requestType.replace(/^care-/, "")
    || "keyholding";
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 32).toLowerCase();
  const workItemId = clean(body.workItemId, 80);
  const contactId = clean(body.contactId, 80);
  const planId = clean(body.planId, 80);
  const validUntil = clean(body.validUntil, 10);
  const followUpOn = clean(body.followUpOn, 10);
  const notes = clean(body.notes, 2000);

  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Ugyldig tilbudshandling." }, { status: 400 });
  if (!UUID.test(workItemId) || !UUID.test(contactId)) {
    return NextResponse.json({ error: "Ugyldig Care-lead eller kontakt." }, { status: 400 });
  }

  const { data: workItem, error: workItemError } = await supabase
    .from("work_items")
    .select("id,source_id,status,brand_id,source_type,next_action,metadata")
    .eq("id", workItemId)
    .eq("source_id", contactId)
    .eq("brand_id", "zeneco")
    .eq("source_type", "website_lead")
    .maybeSingle();

  if (workItemError) return NextResponse.json({ error: workItemError.message }, { status: 400 });
  if (!workItem) return NextResponse.json({ error: "Care-lead ble ikke funnet." }, { status: 404 });

  const metadata = record(workItem.metadata);
  const requestType = clean(metadata.request_type, 80).toLowerCase();
  const isCare = clean(metadata.segment, 40).toLowerCase() === "care"
    || requestType.startsWith("care-")
    || clean(workItem.next_action, 300).toLowerCase().includes("zen eco homes care");
  if (!isCare) return NextResponse.json({ error: "Leadet er ikke et Care-lead." }, { status: 400 });

  const { data: org, error: orgError } = await supabase
    .schema("care")
    .from("orgs")
    .select("id,currency")
    .eq("slug", "zeneco")
    .maybeSingle();

  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 400 });
  if (!org?.id) return NextResponse.json({ error: "Care-organisasjonen er ikke konfigurert." }, { status: 503 });

  const { data: existing, error: existingError } = await supabase
    .schema("care")
    .from("kh_quotes")
    .select("*")
    .eq("work_item_id", workItemId)
    .maybeSingle();

  if (existingError && !/relation .*kh_quotes.*does not exist/i.test(existingError.message || "")) {
    return NextResponse.json({ error: existingError.message }, { status: 400 });
  }
  if (existingError) {
    return NextResponse.json({ error: "Care-tilbud er ikke aktivert i databasen ennå." }, { status: 503 });
  }

  const now = new Date().toISOString();

  if (action === "upsert") {
    if (existing && ["accepted", "declined", "cancelled"].includes(String(existing.status || "").toLowerCase())) {
      return NextResponse.json({ error: "Et ferdigbehandlet tilbud kan ikke overskrives." }, { status: 409 });
    }
    if (!UUID.test(planId)) return NextResponse.json({ error: "Velg en gyldig Care-plan." }, { status: 400 });
    if (validUntil && !validDate(validUntil)) return NextResponse.json({ error: "Ugyldig gyldighetsdato." }, { status: 400 });
    if (!followUpOn || !validDate(followUpOn)) return NextResponse.json({ error: "Sett en gyldig oppfølgingsdato for tilbudet." }, { status: 400 });

    const { data: plan, error: planError } = await supabase
      .schema("care")
      .from("kh_plans")
      .select("id,code,name,visits_per_month,price_cents,currency,included_services,is_active")
      .eq("id", planId)
      .eq("org_id", org.id)
      .eq("is_active", true)
      .maybeSingle();

    if (planError) return NextResponse.json({ error: planError.message }, { status: 400 });
    if (!plan) return NextResponse.json({ error: "Valgt Care-plan er ikke aktiv." }, { status: 400 });

    const planPrice = Number(plan.price_cents || 0);
    const monthlyPriceCents = planPrice;
    const serviceIntent = careIntentFrom(metadata);
    const reference = existing?.reference || `CARE-Q-${new Date().getUTCFullYear()}-${workItemId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const propertyId = UUID.test(clean(metadata.care_property_id, 80)) ? clean(metadata.care_property_id, 80) : null;

    const quotePayload = {
      org_id: org.id,
      work_item_id: workItemId,
      contact_id: contactId,
      property_id: propertyId,
      plan_id: plan.id,
      reference,
      service_intent: serviceIntent,
      status: existing?.status === "sent" ? "sent" : "draft",
      plan_snapshot: {
        id: plan.id,
        code: plan.code,
        name: plan.name,
        visits_per_month: plan.visits_per_month,
        price_cents: planPrice,
        currency: plan.currency,
        included_services: Array.isArray(plan.included_services) ? plan.included_services : [],
      },
      monthly_price_cents: monthlyPriceCents,
      currency: clean(plan.currency || org.currency || "EUR", 3).toUpperCase(),
      valid_until: validUntil || null,
      follow_up_on: followUpOn,
      notes: notes || null,
      updated_at: now,
    };

    const quoteQuery = existing
      ? supabase.schema("care").from("kh_quotes").update(quotePayload).eq("id", existing.id).select("*").single()
      : supabase.schema("care").from("kh_quotes").insert(quotePayload).select("*").single();

    const { data: quote, error: quoteError } = await quoteQuery;
    if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 400 });

    await supabase.from("work_items").update({
      next_action: quote.status === "sent"
        ? "Care-tilbud er sendt. Følg opp svar og avklar oppstart."
        : "Care-tilbud er opprettet som utkast. Kontroller pris og vilkår før du markerer det som sendt.",
      metadata: {
        ...metadata,
        care_quote_id: quote.id,
        care_quote_reference: quote.reference,
        care_quote_status: quote.status,
        care_follow_up_on: quote.follow_up_on || followUpOn || null,
      },
      updated_at: now,
    }).eq("id", workItemId);

    return NextResponse.json({ success: true, quote });
  }

  if (!existing) return NextResponse.json({ error: "Opprett tilbudet før statusen endres." }, { status: 404 });

  const currentStatus = clean(existing.status, 32).toLowerCase();
  let quotePatch: Record<string, unknown> = { updated_at: now };
  let nextAction = "";
  let workStatus = clean(workItem.status, 40) || "IN_PROGRESS";

  let salesPatch: Record<string, unknown> = {};

  if (action === "mark_sent") {
    if (currentStatus !== "draft") return NextResponse.json({ error: "Bare utkast kan markeres som sendt." }, { status: 409 });
    const quoteFollowUpOn = clean(existing.follow_up_on, 10);
    if (!quoteFollowUpOn || !validDate(quoteFollowUpOn)) {
      return NextResponse.json({ error: "Sett oppfølgingsdato i tilbudet før du markerer det som sendt." }, { status: 409 });
    }
    quotePatch = { ...quotePatch, status: "sent", sent_at: now };
    salesPatch = {
      care_sales_stage: "quote_sent",
      care_follow_up_on: quoteFollowUpOn,
      care_quote_sent_at: metadata.care_quote_sent_at || now,
      care_last_followup_at: now,
    };
    nextAction = `Care-tilbud er sendt. Følg opp ${quoteFollowUpOn}.`;
    workStatus = "IN_PROGRESS";
  } else if (action === "accept") {
    if (!["draft", "sent"].includes(currentStatus)) return NextResponse.json({ error: "Tilbudet kan ikke aksepteres fra denne statusen." }, { status: 409 });
    quotePatch = { ...quotePatch, status: "accepted", accepted_at: now };
    salesPatch = {
      care_sales_stage: "accepted",
      care_follow_up_on: null,
      care_last_followup_at: now,
    };
    nextAction = "Care-tilbud er akseptert. Opprett Care-kunde/eiendom og aktiver avtalen.";
    workStatus = "IN_PROGRESS";
  } else if (action === "decline") {
    if (!["draft", "sent"].includes(currentStatus)) return NextResponse.json({ error: "Tilbudet kan ikke avslås fra denne statusen." }, { status: 409 });
    quotePatch = { ...quotePatch, status: "declined", declined_at: now };
    salesPatch = {
      care_sales_stage: "not_relevant",
      care_follow_up_on: null,
      care_last_followup_at: now,
    };
    nextAction = "Care-tilbud ble avslått. Vurder om kunden skal følges opp senere.";
    workStatus = "DONE";
  } else if (action === "cancel") {
    if (currentStatus === "accepted") return NextResponse.json({ error: "Et akseptert tilbud kan ikke kanselleres her." }, { status: 409 });
    quotePatch = { ...quotePatch, status: "cancelled" };
    salesPatch = {
      care_sales_stage: "contacted",
      care_follow_up_on: null,
      care_last_followup_at: now,
    };
    nextAction = "Care-tilbud er kansellert. Vurder neste oppfølging.";
    workStatus = "IN_PROGRESS";
  }

  const { data: quote, error: quoteError } = await supabase
    .schema("care")
    .from("kh_quotes")
    .update(quotePatch)
    .eq("id", existing.id)
    .select("*")
    .single();

  if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 400 });

  await supabase.from("work_items").update({
    status: workStatus,
    next_action: nextAction,
    metadata: {
      ...metadata,
      care_quote_id: quote.id,
      care_quote_reference: quote.reference,
      care_quote_status: quote.status,
      ...salesPatch,
    },
    updated_at: now,
  }).eq("id", workItemId);

  return NextResponse.json({ success: true, quote });
}
