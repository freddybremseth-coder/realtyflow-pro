import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(["owner_stay", "guest_stay", "service_visit", "prep_task", "storm_callout"]);
const EVENT_STATUSES = new Set(["planned", "done", "cancelled"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function validDateTime(value: string) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function titleFor(eventType: string, guestName: string) {
  if (eventType === "owner_stay") return "Eieropphold";
  if (eventType === "guest_stay") return guestName ? `Gjesteopphold · ${guestName}` : "Gjesteopphold";
  if (eventType === "service_visit") return "Servicebesøk";
  if (eventType === "prep_task") return "Klargjøring før ankomst";
  if (eventType === "storm_callout") return "Kontroll etter uvær";
  return "Care-hendelse";
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const propertyId = clean(body.propertyId, 80);
  const eventType = clean(body.eventType, 40).toLowerCase();
  const startsAt = clean(body.startsAt, 40);
  const endsAt = clean(body.endsAt, 40);
  const guestName = clean(body.guestName, 160);
  const notes = clean(body.notes, 500);

  if (!UUID.test(propertyId)) return NextResponse.json({ error: "Velg en gyldig Care-eiendom." }, { status: 400 });
  if (!EVENT_TYPES.has(eventType)) return NextResponse.json({ error: "Velg en gyldig Care-hendelse." }, { status: 400 });
  if (!validDateTime(startsAt)) return NextResponse.json({ error: "Startdato og tid er påkrevd." }, { status: 400 });
  if (endsAt && !validDateTime(endsAt)) return NextResponse.json({ error: "Sluttdato er ugyldig." }, { status: 400 });

  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  if (end.getTime() < start.getTime()) {
    return NextResponse.json({ error: "Sluttdato kan ikke være før startdato." }, { status: 400 });
  }

  const care = supabase.schema("care");
  try {
    const { data: property, error: propertyError } = await care
      .from("kh_properties")
      .select("id,org_id,reference,name,status")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) throw propertyError;
    if (!property) return NextResponse.json({ error: "Care-eiendommen ble ikke funnet." }, { status: 404 });

    const isBillable = eventType === "service_visit" || eventType === "prep_task" || eventType === "storm_callout";
    const { data, error } = await care.from("kh_calendar_events").insert({
      id: randomUUID(),
      org_id: property.org_id,
      property_id: propertyId,
      event_type: eventType,
      title: titleFor(eventType, guestName),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      all_day: false,
      guest_name: guestName || null,
      is_billable: isBillable,
      status: "planned",
      source: "manual",
      notes: notes ? { text: notes } : null,
    }).select("*").single();
    if (error) throw error;

    return NextResponse.json({ success: true, event: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke opprette Care-hendelsen." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const eventId = clean(body.eventId, 80);
  const status = clean(body.status, 40).toLowerCase();

  if (!UUID.test(eventId)) return NextResponse.json({ error: "Ugyldig Care-hendelse." }, { status: 400 });
  if (!EVENT_STATUSES.has(status) || status === "planned") {
    return NextResponse.json({ error: "Hendelsen kan bare markeres utført eller avlyst her." }, { status: 400 });
  }

  const care = supabase.schema("care");
  try {
    const { data: existing, error: fetchError } = await care
      .from("kh_calendar_events")
      .select("id,event_type,status,inspection_id")
      .eq("id", eventId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) return NextResponse.json({ error: "Care-hendelsen ble ikke funnet." }, { status: 404 });
    if (existing.event_type === "inspection") {
      return NextResponse.json({ error: "Tilsyn fullføres fra Besøk & tilsyn." }, { status: 409 });
    }

    const { data, error } = await care.from("kh_calendar_events")
      .update({ status })
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, event: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke oppdatere Care-hendelsen." }, { status: 400 });
  }
}
