import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isLikelyBot } from "@/lib/spam";
import { normalizeBrand } from "@/lib/realty/normalize-brand";
import { checkSourceKey, raiseLeadCaptureAlarm } from "@/lib/realty/source-key-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, x-realtyflow-source-key",
};

type BookingPayload = {
  id?: string;
  brandId?: string;
  brandName?: string;
  serviceId?: string;
  serviceTitle?: string;
  date?: string;
  time?: string;
  duration?: number;
  price?: string;
  paid?: boolean;
  contact?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  answers?: Record<string, unknown>;
  createdAt?: string;
};

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers || {}) },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function clean(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function estimateValue(answers: Record<string, unknown> = {}) {
  const budget = clean(answers.budget, 80);
  const matches = budget.match(/\d[\d.]*/g);
  if (!matches?.length) return 0;
  const last = matches[matches.length - 1].replace(/\./g, "");
  return Number(last) || 0;
}

function propertyInterest(payload: BookingPayload) {
  const answers = payload.answers || {};
  return [
    clean(payload.serviceTitle, 180),
    clean(answers.propertyGoal, 120),
    clean(answers.area, 120),
    clean(answers.spainArea, 120),
  ].filter(Boolean).join(" · ");
}

function notesFrom(payload: BookingPayload) {
  const answers = payload.answers || {};
  const lines = [
    "VIKTIG: WEBMOTE BOOKET - folges opp personlig og prioriteres foran vanlige leads.",
    `Bookingtype: ${clean(payload.serviceTitle, 180)}`,
    `Merkevare: ${clean(payload.brandName || payload.brandId, 120)}`,
    payload.date && payload.time ? `Tidspunkt: ${payload.date} kl. ${payload.time}` : "",
    payload.duration ? `Varighet: ${payload.duration} min` : "",
    payload.price ? `Pris: ${payload.price}` : "",
    payload.id ? `Bookingreferanse: ${payload.id}` : "",
    "",
    "Skjemasvar:",
    ...Object.entries(answers).map(([key, value]) => {
      const display = Array.isArray(value) ? value.join(", ") : clean(value, 1000);
      return `${key}: ${display}`;
    }),
  ];
  return lines.filter((line) => line !== undefined).join("\n").trim();
}

export async function POST(request: NextRequest) {
  const expectedKey = process.env.REALTYFLOW_BOOKING_SOURCE_KEY || process.env.REALTYFLOW_PUBLIC_LEAD_KEY;
  const keyCheck = checkSourceKey(request, expectedKey, "public/booking-leads");
  if (!keyCheck.ok) {
    if (keyCheck.failClosed) await raiseLeadCaptureAlarm("public/booking-leads");
    return json({ error: keyCheck.error }, { status: keyCheck.status });
  }

  const payload = (await request.json().catch(() => ({}))) as BookingPayload & { website?: string; company?: string; url?: string };
  if (payload.website || payload.company || payload.url) {
    return json({ success: true, accepted: false });
  }

  const name = clean(payload.contact?.name, 160);
  const email = clean(payload.contact?.email, 200).toLowerCase();
  const phone = clean(payload.contact?.phone, 80);

  if (!name || !email || !isEmail(email)) {
    return json({ error: "Valid contact.name and contact.email are required" }, { status: 400 });
  }

  if (isLikelyBot(name, email)) {
    return json({ success: true, accepted: false });
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();
  const brandId = normalizeBrand(payload.brandId, "booking");
  const value = estimateValue(payload.answers);
  const notes = notesFrom(payload);
  const interest = propertyInterest(payload);
  const isBusinessLead = brandId === "chatgenius" || payload.serviceId === "freddy-strategy";
  const source = `appointment_app:${brandId}`;

  const { data: existing } = await supabase
    .from("contacts")
    .select("id,notes,interactions,pipeline_status")
    .eq("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const interaction = {
    id: payload.id || `booking-${Date.now()}`,
    type: "meeting",
    direction: "in",
    date: now,
    content: `${clean(payload.serviceTitle, 180)}${payload.date && payload.time ? ` · ${payload.date} ${payload.time}` : ""}`,
  };
  const existingInteractions = Array.isArray(existing?.interactions) ? existing.interactions : [];
  const mergedNotes = [notes, existing?.notes ? `Tidligere notater:\n${existing.notes}` : ""].filter(Boolean).join("\n\n---\n\n");
  const status = existing?.pipeline_status && !["LOST", "ON_HOLD"].includes(existing.pipeline_status)
    ? existing.pipeline_status
    : "NEW";

  const contactPayload = {
    name,
    email,
    phone,
    type: isBusinessLead ? "other" : "buyer",
    source,
    brand: brandId,
    brand_id: brandId,
    pipeline_status: status,
    pipeline_value: value,
    property_interest: interest,
    notes: mergedNotes,
    sentiment: "hot",
    interactions: [interaction, ...existingInteractions],
    last_contact: now,
    next_followup: now,
    updated_at: now,
  };

  const contactWrite = existing?.id
    ? supabase.from("contacts").update(contactPayload).eq("id", existing.id).select().single()
    : supabase.from("contacts").insert({ ...contactPayload, created_at: now }).select().single();

  const { data: contact, error: contactError } = await contactWrite;
  if (contactError) return json({ error: contactError.message }, { status: 500 });

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      name,
      email,
      phone,
      source,
      status: "NEW",
      property: interest,
      value,
      notes,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (leadError) {
    console.warn("[booking-leads] Lead insert failed", leadError.message);
  }

  await supabase.from("work_items").insert({
    title: `Ny booking: ${name}`,
    description: `${clean(payload.serviceTitle, 180)} · ${email}${payload.date && payload.time ? ` · ${payload.date} ${payload.time}` : ""}`,
    status: "TO_DO",
    priority: "HIGH",
    due_date: new Date().toISOString().slice(0, 10),
    brand_id: brandId,
    source_type: "website_lead",
    source_id: contact.id,
    assigned_agent: isBusinessLead ? "business" : "sales",
    next_action: payload.paid
      ? "Sjekk betaling og send personlig bekreftelse."
      : "Prioriter denne webmøte-bookingen: send personlig bekreftelse og forbered møtet.",
    ai_score: 95,
    metadata: {
      appointment_booking_id: payload.id,
      appointment_service_id: payload.serviceId,
      appointment_date: payload.date,
      appointment_time: payload.time,
      appointment_price: payload.price,
      is_web_meeting_booking: true,
      priority_reason: "Kunden har booket konkret mote/webmote",
      lead_id: lead?.id || null,
      lead_insert_failed: Boolean(leadError),
      lead_insert_error: leadError?.message || null,
      created_from_appointment_app: true,
    },
    created_at: now,
    updated_at: now,
  }).then(() => null);

  return json({ success: true, contact, lead: lead || null });
}
