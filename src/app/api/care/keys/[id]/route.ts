import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(["checkout", "checkin", "lost", "retire"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const keyId = clean(params.id, 80);
  if (!UUID.test(keyId)) {
    return NextResponse.json({ error: "Ugyldig Care-nøkkel." }, { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 24).toLowerCase();
  const holderName = clean(body.holderName, 160);
  const reason = clean(body.reason, 500);

  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "Ukjent nøkkelhandling." }, { status: 400 });
  }
  if (action === "checkout" && !holderName) {
    return NextResponse.json({ error: "Oppgi hvem nøkkelen leveres til." }, { status: 400 });
  }
  if ((action === "lost" || action === "retire") && !reason) {
    return NextResponse.json({ error: "Skriv en kort årsak." }, { status: 400 });
  }

  const care = supabase.schema("care");
  const { data: key, error: keyError } = await care
    .from("kh_keys")
    .select("id,org_id,property_id,label,status")
    .eq("id", keyId)
    .maybeSingle();

  if (keyError) {
    return NextResponse.json({ error: keyError.message }, { status: 400 });
  }
  if (!key) {
    return NextResponse.json({ error: "Care-nøkkelen ble ikke funnet." }, { status: 404 });
  }

  const { data: org, error: orgError } = await care
    .from("orgs")
    .select("id,slug")
    .eq("id", key.org_id)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 400 });
  }
  if (!org || org.slug !== "zeneco") {
    return NextResponse.json({ error: "Nøkkelen tilhører ikke Zen Eco Homes Care." }, { status: 403 });
  }

  if (key.status === "retired") {
    return NextResponse.json({ error: "En utgått nøkkel kan ikke endres." }, { status: 409 });
  }
  if (action === "checkout" && key.status !== "in_office") {
    return NextResponse.json({ error: "Bare nøkler som er inne kan sjekkes ut." }, { status: 409 });
  }
  if (action === "checkin" && key.status !== "with_holder") {
    return NextResponse.json({ error: "Bare utlånte nøkler kan sjekkes inn." }, { status: 409 });
  }

  const nextStatus = action === "checkout"
    ? "with_holder"
    : action === "checkin"
      ? "in_office"
      : action === "lost"
        ? "lost"
        : "retired";

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await care
    .from("kh_keys")
    .update({ status: nextStatus })
    .eq("id", keyId)
    .select("id,property_id,label,storage_location,status,created_at")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  if (action === "checkout" || action === "checkin") {
    const { error: eventError } = await care.from("kh_key_events").insert({
      org_id: key.org_id,
      key_id: key.id,
      property_id: key.property_id,
      action: action === "checkout" ? "checked_out" : "checked_in",
      holder_name: action === "checkout" ? holderName : holderName || null,
      holder_contact_id: null,
      reason: reason || null,
      at: now,
    });
    if (eventError) {
      await care.from("kh_keys").update({ status: key.status }).eq("id", keyId);
      return NextResponse.json({ error: eventError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ success: true, key: updated });
}
