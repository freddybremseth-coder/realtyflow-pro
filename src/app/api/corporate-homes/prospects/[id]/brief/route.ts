import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCorporateDecisionBrief } from "@/lib/corporate-decision-brief";

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
  const denied = await requireAdminApi(request, { prospect: null, brief: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;

  const [
    { data: prospect, error: prospectError },
    { data: contacts, error: contactsError },
  ] = await Promise.all([
    supabase
      .from("corporate_prospects")
      .select("*")
      .eq("id", id)
      .eq("brand_id", "zeneco")
      .maybeSingle(),
    supabase
      .from("corporate_prospect_contacts")
      .select("id,name,title,buying_role,seniority,email,phone,linkedin_url,status,is_primary,confidence,source_url,verified_at")
      .eq("prospect_id", id)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  const brief = buildCorporateDecisionBrief(prospect);

  return NextResponse.json({
    prospect,
    contacts: contacts || [],
    brief,
    warnings: contactsError ? [contactsError.message] : [],
  });
}
