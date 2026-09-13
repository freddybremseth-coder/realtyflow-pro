import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildPipelineHealthSnapshot } from "@/lib/nexus/pipeline-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { pipelineHealth: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", pipelineHealth: null }, { status: 500 });

  const results = await Promise.allSettled([
    supabase.from("contacts")
      .select("id,name,email,brand_id,brand,pipeline_status,pipeline_value,nurture_status,last_contact,last_inbound_reply_at,last_reply_classification,waiting_on,waiting_reason,waiting_until,do_not_contact,email_suppressed,updated_at")
      .order("updated_at", { ascending: false })
      .limit(4000),
    supabase.from("buyer_profiles")
      .select("id,brand,contact_id,status,purchase_readiness,approved_at,created_at,updated_at")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("lead_property_shortlists")
      .select("id,brand,buyer_profile_id,status,approved_at,archived_at,created_at,updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("lead_customer_presentations")
      .select("id,brand,buyer_profile_id,shortlist_id,status,approved_at,archived_at,created_at,updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("lead_customer_message_drafts")
      .select("id,brand,presentation_id,buyer_profile_id,shortlist_id,status,approved_at,sent_at,cancelled_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("work_items")
      .select("id,status,priority,brand_id,source_type,source_id,next_action,metadata,created_at,updated_at")
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .order("updated_at", { ascending: false })
      .limit(5000),
    supabase.from("nexus_property_recommendation_send_receipts")
      .select("id,message_draft_id,presentation_id,buyer_profile_id,shortlist_id,contact_id,status,sent_at,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
  ]);

  const contactsResult = results[0];
  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente CRM-kontakter"
      : contactsResult.value?.error?.message || "Kunne ikke hente CRM-kontakter";
    return NextResponse.json({ error: message, pipelineHealth: null }, { status: 500 });
  }

  const warnings: string[] = [];
  const rows = (result: PromiseSettledResult<any>, table: string) => {
    if (result.status === "rejected") {
      warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
      return [];
    }
    if (result.value?.error) {
      const message = String(result.value.error.message || "");
      if (!optionalTableError(message)) warnings.push(`${table}: ${message}`);
      return [];
    }
    return result.value?.data || [];
  };

  const pipelineHealth = buildPipelineHealthSnapshot({
    contacts: contactsResult.value?.data || [],
    buyerProfiles: rows(results[1], "buyer_profiles"),
    shortlists: rows(results[2], "lead_property_shortlists"),
    presentations: rows(results[3], "lead_customer_presentations"),
    messageDrafts: rows(results[4], "lead_customer_message_drafts"),
    workItems: rows(results[5], "work_items"),
    sendReceipts: rows(results[6], "nexus_property_recommendation_send_receipts"),
  });

  return NextResponse.json({
    pipelineHealth,
    warnings,
    note: "Lead Journey Monitor er read-only observability. Den sender ingen kundemeldinger og endrer ikke CRM, Buyer Profile, shortlist, presentasjon eller pipeline.",
  });
}
