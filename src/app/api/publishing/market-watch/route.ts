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
  const unauthorized = await requireAdminApi(request, { snapshots: [] });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ snapshots: [] });

  const { data, error } = await supabase
    .from("publishing_market_snapshots")
    .select("id,query,total_results_estimate,summary,top_results,created_at")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    if (/publishing_market_snapshots|schema cache|does not exist|relation/i.test(error.message)) {
      return NextResponse.json({ snapshots: [], tableNotReady: true, error: error.message });
    }
    return NextResponse.json({ snapshots: [], error: error.message }, { status: 500 });
  }

  return NextResponse.json({ snapshots: data || [] });
}
