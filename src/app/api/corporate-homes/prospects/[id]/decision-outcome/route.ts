import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildCorporateDecisionOutcome,
  type CorporateDecisionOutcome,
} from "@/lib/corporate-decision-outcome";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const OUTCOMES = new Set<CorporateDecisionOutcome>([
  "APPROVE_VIEWINGS",
  "APPROVE_OFFER_PREP",
  "NEEDS_CHANGES",
  "HOLD",
]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi(request, { outcome: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const outcome = String(body?.outcome || "").toUpperCase() as CorporateDecisionOutcome;
  if (!OUTCOMES.has(outcome)) {
    return NextResponse.json({ error: "Ugyldig beslutningsutfall." }, { status: 400 });
  }

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
    update = buildCorporateDecisionOutcome({
      status: prospect.status,
      evidence: prospect.evidence,
      outcome,
      selectedPropertyRef: body?.selected_property_ref || null,
      note: body?.note || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke registrere beslutningsutfallet." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updatedProspect, error: updateError } = await supabase
    .from("corporate_prospects")
    .update({
      status: update.status,
      next_action: update.next_action,
      next_followup: update.next_followup,
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
    .eq("source_type", "corporate_decision_outcome")
    .eq("source_id", id)
    .maybeSingle();

  const workItem = {
    title: `Corporate beslutning · ${String(prospect.company_name || "Selskap")}`,
    description: update.outcome.label,
    status: "TO_DO",
    priority: ["APPROVE_VIEWINGS", "APPROVE_OFFER_PREP"].includes(outcome) ? "HIGH" : "MEDIUM",
    brand_id: "zeneco",
    source_type: "corporate_decision_outcome",
    source_id: id,
    assigned_agent: "sales",
    due_date: update.next_followup.slice(0, 10),
    next_action: update.next_action,
    ai_score: Math.max(80, Number(prospect.fit_score || 0)),
    metadata: {
      segment: "corporate_homes",
      prospect_id: id,
      decision_outcome: outcome,
      selected_property_ref: update.outcome.selected_property_ref,
      customer_message_sent: false,
      calendar_action_created: false,
      offer_sent: false,
    },
    updated_at: now,
  };

  if (existingWorkItem?.id) {
    await supabase.from("work_items").update(workItem).eq("id", existingWorkItem.id);
  } else {
    await supabase.from("work_items").insert({ ...workItem, created_at: now });
  }

  return NextResponse.json({
    prospect: updatedProspect,
    outcome: update.outcome,
    automation: {
      customer_message_sent: false,
      calendar_action_created: false,
      offer_sent: false,
      reservation_created: false,
      note: "Kun internt beslutningsutfall og arbeidsoppgave ble registrert.",
    },
  });
}
