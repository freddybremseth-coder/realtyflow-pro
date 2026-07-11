import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildRevenueCommandCenter } from "@/lib/revenue/command";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function optionalRows(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return [];
  }
  if (result.value?.error) {
    if (!optionalTableError(result.value.error.message || "")) warnings.push(`${table}: ${result.value.error.message}`);
    return [];
  }
  return result.value?.data || [];
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { command: null });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", command: null }, { status: 500 });

  const results = await Promise.allSettled([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(2000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,purchase_readiness,budget_amount,budget_currency,summary,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
  ]);

  const contactResult = results[0];
  if (contactResult.status === "rejected") {
    return NextResponse.json({ error: contactResult.reason instanceof Error ? contactResult.reason.message : "Kunne ikke hente kontakter", command: null }, { status: 500 });
  }
  if (contactResult.value?.error) {
    return NextResponse.json({ error: contactResult.value.error.message, command: null }, { status: 500 });
  }

  const warnings: string[] = [];
  const contacts = contactResult.value?.data || [];
  const profiles = optionalRows(results[1], "buyer_profiles", warnings);
  const shortlists = optionalRows(results[2], "lead_property_shortlists", warnings);
  const presentations = optionalRows(results[3], "lead_customer_presentations", warnings);
  const messageDrafts = optionalRows(results[4], "lead_customer_message_drafts", warnings);

  const command = buildRevenueCommandCenter({
    contacts,
    profiles,
    shortlists,
    presentations,
    messageDrafts,
    warnings,
  });

  return NextResponse.json({ command });
}
