import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildRevenueForecast } from "@/lib/revenue/forecast";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { forecast: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured", forecast: null }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const brand = String(searchParams.get("brand") || "").trim().toLowerCase();

  let query = supabase
    .from("contacts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (brand && brand !== "all") {
    query = query.or(`brand_id.eq.${brand},brand.eq.${brand}`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message, forecast: null }, { status: 500 });
  }

  const forecast = buildRevenueForecast(data || []);
  return NextResponse.json({ forecast });
}
