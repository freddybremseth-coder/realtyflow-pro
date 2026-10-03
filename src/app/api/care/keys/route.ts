import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_STATUSES = new Set(["in_office", "with_holder", "lost", "retired"]);
const KEY_ACTIONS = new Set(["checked_out", "checked_in"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

async function loadProperty(care: any, propertyId: string) {
  const { data, error } = await care
    .from("kh_properties")
    .select("id,org_id,reference,name,status")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const propertyId = clean(body.propertyId, 80);
  const label = clean(body.label, 120);
  const storageLocation = clean(body.storageLocation, 160);
  const code = clean(body.code, 80);

  if (!UUID.test(propertyId)) return NextResponse.json({ error: "Velg en gyldig Care-eiendom." }, { status: 400 });
  if (!label) return NextResponse.json({ error: "Nøkkelen må ha et navn eller nummer." }, { status: 400 });

  const care = supabase.schema("care");
  try {
    const property = await loadProperty(care, propertyId);
    if (!property) return NextResponse.json({ error: "Care-eiendommen ble ikke funnet." }, { status: 404 });

    const id = randomUUID();
    const { data, error } = await care.from("kh_keys").insert({
      id,
      org_id: property.org_id,
      property_id: propertyId,
      label,
      storage_location: storageLocation || null,
      code: code || null,
      status: "in_office",
    }).select("*").single();
    if (error) throw error;

    return NextResponse.json({ success: true, key: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke registrere nøkkelen." }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const keyId = clean(body.keyId, 80);
  const action = clean(body.action, 40).toLowerCase();
  const holderName = clean(body.holderName, 160);
  const reason = clean(body.reason, 300);
  const storageLocation = clean(body.storageLocation, 160);

  if (!UUID.test(keyId)) return NextResponse.json({ error: "Ugyldig Care-nøkkel." }, { status: 400 });

  const care = supabase.schema("care");
  try {
    const { data: key, error: keyError } = await care
      .from("kh_keys")
      .select("id,org_id,property_id,label,status,storage_location")
      .eq("id", keyId)
      .maybeSingle();
    if (keyError) throw keyError;
    if (!key) return NextResponse.json({ error: "Care-nøkkelen ble ikke funnet." }, { status: 404 });

    if (KEY_ACTIONS.has(action)) {
      if (action === "checked_out" && !holderName) {
        return NextResponse.json({ error: "Skriv hvem som får nøkkelen." }, { status: 400 });
      }
      const nextStatus = action === "checked_out" ? "with_holder" : "in_office";
      const { data: event, error: eventError } = await care.from("kh_key_events").insert({
        id: randomUUID(),
        org_id: key.org_id,
        key_id: key.id,
        property_id: key.property_id,
        action,
        holder_name: action === "checked_out" ? holderName : null,
        reason: reason || null,
        at: new Date().toISOString(),
      }).select("*").single();
      if (eventError) throw eventError;

      const update: Record<string, unknown> = { status: nextStatus };
      if (action === "checked_in" && storageLocation) update.storage_location = storageLocation;
      const { data: updated, error: updateError } = await care.from("kh_keys")
        .update(update)
        .eq("id", key.id)
        .select("*")
        .single();
      if (updateError) throw updateError;

      return NextResponse.json({ success: true, key: updated, event });
    }

    if (action === "lost" || action === "retired") {
      const status = action;
      if (!KEY_STATUSES.has(status)) return NextResponse.json({ error: "Ugyldig nøkkelstatus." }, { status: 400 });
      const { data: updated, error } = await care.from("kh_keys")
        .update({ status })
        .eq("id", key.id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, key: updated });
    }

    if (action === "update_storage") {
      if (!storageLocation) return NextResponse.json({ error: "Skriv lagringsplassering." }, { status: 400 });
      const { data: updated, error } = await care.from("kh_keys")
        .update({ storage_location: storageLocation })
        .eq("id", key.id)
        .select("*")
        .single();
      if (error) throw error;
      return NextResponse.json({ success: true, key: updated });
    }

    return NextResponse.json({ error: "Ukjent nøkkelhandling." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nøkkelhandlingen feilet." }, { status: 400 });
  }
}
