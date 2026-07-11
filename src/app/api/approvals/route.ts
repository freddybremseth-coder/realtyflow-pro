import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { approvalSummary, buildApprovalQueue } from "@/lib/approvals";

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

function settledRows(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
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
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const results = await Promise.allSettled([
    supabase.from("contacts").select("id,name,email").order("updated_at", { ascending: false }).limit(1000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,purchase_readiness,budget_amount,budget_currency,summary,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,created_at,updated_at").order("created_at", { ascending: true }).limit(500),
  ]);

  const warnings: string[] = [];
  const contacts = settledRows(results[0], "contacts", warnings);
  const profiles = settledRows(results[1], "buyer_profiles", warnings);
  const shortlists = settledRows(results[2], "lead_property_shortlists", warnings);
  const presentations = settledRows(results[3], "lead_customer_presentations", warnings);
  const messageDrafts = settledRows(results[4], "lead_customer_message_drafts", warnings);

  const items = buildApprovalQueue({ contacts, profiles, shortlists, presentations, messageDrafts });
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: approvalSummary(items),
    items,
    warnings,
    safety: {
      automaticApproval: false,
      automaticSending: false,
      messageApprovalLocation: "communications",
      upstreamApprovalLocation: "lead-intelligence",
    },
  });
}
