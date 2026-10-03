import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const propertyId = clean(body.propertyId, 80);
  const label = clean(body.label, 120);
  const storageLocation = clean(body.storageLocation, 160);
  const code = clean(body.code, 80);

  if (!UUID.test(propertyId)) {
    return NextResponse.json({ error: "Velg en gyldig Care-eiendom." }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "Gi nøkkelen et internt navn." }, { status: 400 });
  }

  const care = supabase.schema("care");
  const { data: property, error: propertyError } = await care
    .from("kh_properties")
    .select("id,org_id,owner_id,status")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) {
    return NextResponse.json({ error: propertyError.message }, { status: 400 });
  }
  if (!property) {
    return NextResponse.json({ error: "Care-eiendommen ble ikke funnet." }, { status: 404 });
  }

  const { data: org, error: orgError } = await care
    .from("orgs")
    .select("id,slug")
    .eq("id", property.org_id)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }
  if (!org || org.slug !== "zeneco") {
    return NextResponse.json({ error: "Eiendommen tilhører ikke Zen Eco Homes Care." }, { status: 403 });
  }

  const now = new Date().toISOString();
  const { data: key, error: keyError } = await care
    .from("kh_keys")
    .insert({
      org_id: property.org_id,
      property_id: property.id,
      label,
      storage_location: storageLocation || null,
      code: code || null,
      status: "in_office",
    })
    .select("id,property_id,label,storage_location,status,created_at")
    .single();

  if (keyError) {
    return NextResponse.json({ error: keyError.message }, { status: 400 });
  }

  const { error: eventError } = await care.from("kh_key_events").insert({
    org_id: property.org_id,
    key_id: key.id,
    property_id: property.id,
    action: "checked_in",
    holder_name: null,
    holder_contact_id: null,
    reason: "Registrert i Care",
    at: now,
  });

  if (eventError) {
    await care.from("kh_keys").delete().eq("id", key.id);
    return NextResponse.json({ error: eventError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, key }, { status: 201 });
}
