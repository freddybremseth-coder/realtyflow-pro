import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildRevenueCommandCenter } from "@/lib/revenue/command";
import { buildRevenueBrain } from "@/lib/nexus/revenue-brain";
import { attachCommunicationLearningToRevenueBrain } from "@/lib/nexus/next-best-action-communication";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key) : null;
}

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { nextBestAction: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", nextBestAction: null }, { status: 500 });

  const results = await Promise.allSettled([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,purchase_readiness,budget_amount,budget_currency,summary,created_at,updated_at").limit(500),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,language,created_at,updated_at").limit(500),
    supabase.from("nexus_communication_learning_rules")
      .select("id,brand_id,dimension,value,sample,reply_rate,evidence,verdict,finding,status,updated_at")
      .eq("status", "active")
      .in("evidence", ["moderate", "strong"])
      .in("verdict", ["prefer", "avoid"])
      .gte("sample", 10)
      .order("updated_at", { ascending: false })
      .limit(1000),
  ]);

  const contactsResult = results[0];
  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente CRM-data"
      : contactsResult.value?.error?.message || "Kunne ikke hente CRM-data";
    return NextResponse.json({ error: message, nextBestAction: null }, { status: 500 });
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

  const contacts = contactsResult.value?.data || [];
  const profiles = rows(results[1], "buyer_profiles");
  const shortlists = rows(results[2], "lead_property_shortlists");
  const presentations = rows(results[3], "lead_customer_presentations");
  const messageDrafts = rows(results[4], "lead_customer_message_drafts");
  const communicationRules = rows(results[5], "nexus_communication_learning_rules");

  const command = buildRevenueCommandCenter({
    contacts,
    profiles,
    shortlists,
    presentations,
    messageDrafts,
    warnings: [],
  }, new Date());
  const brain = buildRevenueBrain(command, 25);
  const nextBestAction = attachCommunicationLearningToRevenueBrain({
    brain,
    contacts,
    rules: communicationRules,
  });

  return NextResponse.json({
    nextBestAction,
    warnings,
    safety: {
      recommendationOnly: true,
      automaticSending: false,
      automaticApproval: false,
      policyRegistryStillAuthoritative: true,
      communicationLearningCanChangePolicy: false,
    },
  });
}
