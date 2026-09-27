import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCorporatePartnerOutreach,
  CORPORATE_PARTNER_OUTREACH_RULES,
} from "@/lib/corporate-partner-outreach";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { drafts: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", drafts: [] }, { status: 500 });

  const { id } = await context.params;
  const { data: partner, error } = await supabase
    .from("corporate_partner_prospects")
    .select("id,company_name,partner_type,referral_angle,status,fit_score,fit_tier")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message, drafts: [] }, { status: 500 });
  if (!partner) return NextResponse.json({ error: "Partner prospect not found", drafts: [] }, { status: 404 });

  return NextResponse.json({
    partner,
    drafts: buildCorporatePartnerOutreach(partner),
    rules: CORPORATE_PARTNER_OUTREACH_RULES,
    sendAllowed: false,
    note: "Utkast for manuell vurdering og kopiering. Ingen kontaktperson er identifisert og ingen e-post sendes.",
  });
}
