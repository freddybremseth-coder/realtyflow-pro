import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCorporateOpportunityUpdate } from "@/lib/corporate-opportunity";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { prospect: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const { data: prospect, error: prospectError } = await supabase
    .from("corporate_prospects")
    .select("*")
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (prospectError) return NextResponse.json({ error: prospectError.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ error: "Prospect not found" }, { status: 404 });

  let update;
  try {
    update = buildCorporateOpportunityUpdate({
      status: prospect.status,
      evidence: prospect.evidence,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke opprette Opportunity." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      status: update.status,
      next_followup: update.next_followup,
      next_action: update.next_action,
      evidence: update.evidence,
      updated_at: now,
    })
    .eq("id", id)
    .eq("brand_id", "zeneco")
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const { data: existingWorkItem } = await supabase
    .from("work_items")
    .select("id")
    .eq("brand_id", "zeneco")
    .eq("source_type", "corporate_opportunity")
    .eq("source_id", id)
    .maybeSingle();

  const workItemPayload = {
    title: `Corporate Opportunity · ${String(prospect.company_name || "Selskap")}`,
    description: "Discovery er eksplisitt fullført og minimumskriteriene er dokumentert. Bygg beslutningsklart bolig- og styregrunnlag.",
    status: "TO_DO",
    priority: "HIGH",
    brand_id: "zeneco",
    source_type: "corporate_opportunity",
    source_id: id,
    assigned_agent: "sales",
    due_date: update.next_followup.slice(0, 10),
    next_action: update.next_action,
    ai_score: Math.max(85, Number(prospect.fit_score || 0)),
    metadata: {
      segment: "corporate_homes",
      prospect_id: id,
      opportunity_promoted_at: update.opportunity.promoted_at,
      automatic_customer_contact: false,
      personal_data_enriched: false,
    },
    updated_at: now,
  };

  if (existingWorkItem?.id) {
    await supabase.from("work_items").update(workItemPayload).eq("id", existingWorkItem.id);
  } else {
    await supabase.from("work_items").insert({ ...workItemPayload, created_at: now });
  }

  return NextResponse.json({
    prospect: updatedProspect,
    opportunity: update.opportunity,
    automation: {
      customer_message_sent: false,
      calendar_action: false,
      personal_enrichment: false,
      note: "Opportunity ble opprettet internt. Ingen kundekommunikasjon ble sendt.",
    },
  });
}
