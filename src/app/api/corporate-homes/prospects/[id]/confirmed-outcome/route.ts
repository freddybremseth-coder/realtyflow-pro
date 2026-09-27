import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  appendCorporateConfirmedOutcome,
  buildCorporateConfirmedOutcome,
  type CorporateConfirmedOutcomeType,
} from "@/lib/corporate-confirmed-outcome";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const TYPES = new Set<CorporateConfirmedOutcomeType>(["VIEWING_COMPLETED", "OFFER_MADE"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { outcome: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const type = String(body?.type || "").toUpperCase() as CorporateConfirmedOutcomeType;
  if (!TYPES.has(type)) return NextResponse.json({ error: "Ugyldig outcome-type." }, { status: 400 });

  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  if (!prospect.converted_contact_id) {
    return NextResponse.json({ error: "Prospektet må være promotert til CRM først." }, { status: 409 });
  }

  const { data: crmContact, error: crmError } = await supabase
    .from("contacts")
    .select("id,brand_id,pipeline_status")
    .eq("id", prospect.converted_contact_id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (crmError) return NextResponse.json({ error: crmError.message }, { status: 500 });
  if (!crmContact) {
    return NextResponse.json({ error: "Koblet Zen Eco Homes CRM-kontakt finnes ikke lenger." }, { status: 409 });
  }

  let outcome;
  try {
    outcome = buildCorporateConfirmedOutcome({
      status: prospect.status,
      evidence: prospect.evidence,
      convertedContactId: prospect.converted_contact_id,
      type,
      propertyRef: body?.property_ref || null,
      occurredAt: body?.occurred_at || null,
      offerAmountEur: body?.offer_amount_eur || null,
      note: body?.note || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke registrere bekreftet outcome." },
      { status: 409 },
    );
  }

  const sourceId = `${id}:${outcome.eventType}:${outcome.propertyRef}:${outcome.occurredAt}`;
  const revenue = await insertRevenueEvent(supabase, {
    eventType: outcome.eventType,
    title: outcome.eventType === "viewing_completed" ? "Corporate visning fullført" : "Corporate tilbud gitt",
    description: outcome.note,
    contactId: prospect.converted_contact_id,
    brandId: "zeneco",
    sourceSystem: "corporate_homes",
    sourceType: "corporate_confirmed_outcome",
    sourceId,
    actorType: "human",
    occurredAt: outcome.occurredAt,
    dedupeKey: buildRevenueEventDedupeKey([
      "corporate",
      id,
      outcome.eventType,
      outcome.propertyRef,
      outcome.occurredAt,
    ]),
    metadata: {
      corporate_prospect_id: id,
      company_name: prospect.company_name,
      property_ref: outcome.propertyRef,
      offer_amount_eur: outcome.offerAmountEur,
      confirmed_by_human: true,
      next_status: outcome.crmPipelineStatus,
    },
    createdBy: "corporate-homes-dossier",
  });

  if (!revenue.ok) {
    return NextResponse.json(
      { error: revenue.error || "Revenue Outcome kunne ikke registreres.", tableNotReady: revenue.tableNotReady },
      { status: revenue.tableNotReady ? 503 : 500 },
    );
  }

  const now = new Date().toISOString();
  const loggedOutcome = {
    type,
    event_type: outcome.eventType,
    occurred_at: outcome.occurredAt,
    property_ref: outcome.propertyRef,
    offer_amount_eur: outcome.offerAmountEur,
    note: outcome.note,
    crm_pipeline_status: outcome.crmPipelineStatus,
    revenue_event_id: (revenue.event as any)?.id || null,
    confirmed_by_human: true,
    automated_external_action: false,
    logged_at: now,
  };

  const { error: contactError } = await supabase
    .from("contacts")
    .update({
      pipeline_status: outcome.crmPipelineStatus,
      next_followup: now,
      updated_at: now,
    })
    .eq("id", prospect.converted_contact_id)
    .eq("brand_id", "zeneco");

  if (contactError) {
    return NextResponse.json({
      error: `Revenue Outcome er registrert, men CRM-status kunne ikke synkroniseres: ${contactError.message}`,
      revenueEventRecorded: true,
    }, { status: 500 });
  }

  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      evidence: appendCorporateConfirmedOutcome(prospect.evidence, loggedOutcome),
      next_action: outcome.nextAction,
      next_followup: now,
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message, revenueEventRecorded: true }, { status: 500 });

  return NextResponse.json({
    prospect: updatedProspect,
    outcome: loggedOutcome,
    revenueEvent: revenue.event || null,
    crm: {
      contact_id: prospect.converted_contact_id,
      pipeline_status: outcome.crmPipelineStatus,
    },
    automation: {
      customer_message_sent: false,
      seller_message_sent: false,
      calendar_action_created: false,
      offer_sent_by_realtyflow: false,
      reservation_created: false,
      payment_initiated: false,
      note: "RealtyFlow loggførte bare en hendelse som et menneske bekreftet allerede hadde skjedd.",
    },
  });
}
