import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers || {}) },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const brandId = request.nextUrl.searchParams.get("brand_id") || request.nextUrl.searchParams.get("brand") || "";
  if (!brandId) return json({ error: "brand_id is required" }, { status: 400 });
  if (!supabase) return json({ error: "No DB" }, { status: 500 });

  const { data, error } = await supabase
    .from("brand_settings")
    .select("settings")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });

  const booking = data?.settings?.booking;
  if (!booking?.published) {
    return json({ error: "Booking page is not published for this brand" }, { status: 404 });
  }

  return json({ config: booking });
}
