import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { enabled: false });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ enabled: false, error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").maybeSingle();
  if (error) return NextResponse.json({ enabled: false, error: error.message }, { status: 500 });
  return NextResponse.json({ enabled: Boolean((data as any)?.settings?.publishing_hard_mode === true) });
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const enabled = Boolean(body.enabled);

  const { data: current } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").maybeSingle();
  const settings = { ...((current as any)?.settings || {}), publishing_hard_mode: enabled };

  const { error } = await supabase.from("brand_settings").upsert(
    { brand_id: "_system", settings, updated_at: new Date().toISOString() },
    { onConflict: "brand_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, enabled });
}
