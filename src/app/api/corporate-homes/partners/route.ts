import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { partners: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", partners: [] }, { status: 500 });

  const { data, error } = await supabase
    .from("corporate_partner_prospects")
    .select("*")
    .eq("brand_id", "zeneco")
    .order("fit_score", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message, partners: [] }, { status: 500 });

  return NextResponse.json({
    partners: data || [],
    guardrails: {
      companyLevelOnly: true,
      personalEnrichmentStarted: false,
      automaticOutreach: false,
      note: "Partner discovery contains public company-level data only. Identify or enrich people only after explicit approval.",
    },
  });
}
