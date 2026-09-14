import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import {
  buildRealEstateMatchingPreparation,
  canPrepareRealEstateMatchingMission,
  matchingWorkItemPriority,
  preparedMatchingTraceStep,
} from "@/lib/nexus-real-estate-matching-preparer";
import {
  storeRowToOpportunity,
  type NexusOpportunityStoreRow,
} from "@/lib/nexus-opportunity-store";
import { makeSupabaseAgentRunStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function preparedMatchingArtifact(run: { steps: Array<{ data?: Record<string, unknown> }> }) {
  return [...run.steps].reverse().find(
    (step) => step.data?.transition === "prepared"
      && step.data?.artifact_type === "property_matching_work_item"
      && typeof step.data?.artifact_id === "string",
  );
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const missionId = typeof body?.missionId === "string" ? body.missionId.trim() : "";
  if (!missionId) return NextResponse.json({ error: "missionId required" }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data, error } = await supabase
    .from("nexus_business_opportunities")
    .select("contact_id,brand_id,offer_id,pipeline_id,stage_id,lifecycle_phase,opportunity_state,title,reason,next_action,priority,priority_score,value,currency,route_confidence,route_reason,source_system,source_id,source_updated_at,last_activity_at,metadata")
    .in("opportunity_state", ["active", "won"])
    .order("priority_score", { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as NexusOpportunityStoreRow[];
  const snapshot = buildNexusRevenueCommandCenter(rows);
  const mission = snapshot.growthMissions.find((item) => item.id === missionId);
  if (!mission) return NextResponse.json({ error: "Mission not found in current Revenue Command snapshot" }, { status: 404 });
  const plan = snapshot.agenticPlans.find((item) => item.missionId === missionId);
  if (!plan) return NextResponse.json({ error: "Agentic plan not found for mission" }, { status: 500 });
  if (!canPrepareRealEstateMatchingMission(mission, plan)) {
    return NextResponse.json({
      error: "No registered real-estate matching preparer for this mission",
      actionClass: plan.actionClass,
      capability: plan.capability,
    }, { status: 409 });
  }

  const sourceRow = rows.find((row) => storeRowToOpportunity(row)?.id === mission.opportunityId);
  if (!sourceRow?.contact_id) {
    return NextResponse.json({ error: "Mission has no verified CRM contact link" }, { status: 409 });
  }

  const contactResult = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,do_not_contact,email_suppressed")
    .eq("id", sourceRow.contact_id)
    .maybeSingle();
  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  const contact = contactResult.data;
  if (!contact) return NextResponse.json({ error: "Verified CRM contact not found" }, { status: 409 });
  if (contact.do_not_contact || contact.email_suppressed) {
    return NextResponse.json({ error: "Customer is blocked from active sales follow-up" }, { status: 409 });
  }
  if (["WON", "LOST"].includes(String(contact.pipeline_status || "").toUpperCase())) {
    return NextResponse.json({ error: "Terminal customer cannot enter automatic property matching" }, { status: 409 });
  }

  const profileResult = await supabase
    .from("buyer_profiles")
    .select("id,contact_id,brand,version,status,purchase_readiness,budget_amount,budget_currency,summary,approved_at,updated_at")
    .eq("contact_id", sourceRow.contact_id)
    .eq("status", "approved")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  const profile = profileResult.data;
  if (!profile?.id) {
    return NextResponse.json({
      error: "Approved Buyer Profile required before automatic property matching",
      nextAction: "Complete and approve Buyer Profile first.",
    }, { status: 409 });
  }

  const criteriaResult = await supabase
    .from("buyer_profile_criteria")
    .select("key,other_key,value,confidence,customer_confirmed,approval_status,active")
    .eq("buyer_profile_id", profile.id)
    .eq("active", true);
  if (criteriaResult.error) return NextResponse.json({ error: criteriaResult.error.message }, { status: 500 });

  const criteria = (criteriaResult.data || []).map((row: any) => ({
    key: row.key,
    otherKey: row.other_key,
    value: row.value,
    confidence: row.confidence === null ? null : Number(row.confidence),
    customerConfirmed: row.customer_confirmed,
    approvalStatus: row.approval_status,
    active: row.active,
  }));
  const prepared = buildRealEstateMatchingPreparation(
    mission,
    contact,
    {
      id: String(profile.id),
      version: Number(profile.version || 1),
      status: profile.status,
      purchaseReadiness: profile.purchase_readiness,
      budgetAmount: profile.budget_amount === null ? null : Number(profile.budget_amount),
      updatedAt: profile.updated_at,
    },
    criteria,
  );
  if (!prepared.ready) {
    return NextResponse.json({
      error: "Buyer Profile health blocks automatic property matching",
      health: prepared.health,
      nextAction: prepared.nextAction,
    }, { status: 409 });
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const intake = await intakeNexusMission(runStore, mission, plan);
  let run = intake.run;
  const existingPrepared = preparedMatchingArtifact(run);
  if (existingPrepared) {
    return NextResponse.json({
      ok: true,
      created: false,
      run: { id: run.id, status: run.status },
      workItem: { id: String(existingPrepared.data?.artifact_id || "") },
      state: "prepared",
      profileHealth: prepared.health,
      safety: { externalActionExecuted: false, customerMessageSent: false, buyerProfileChanged: false },
    });
  }

  const existingWorkItem = await supabase
    .from("work_items")
    .select("id,status")
    .eq("source_type", "crm")
    .eq("source_id", prepared.sourceId)
    .limit(1)
    .maybeSingle();
  if (existingWorkItem.error) return NextResponse.json({ error: existingWorkItem.error.message }, { status: 500 });

  let workItemId = existingWorkItem.data?.id ? String(existingWorkItem.data.id) : "";
  let created = false;
  if (!workItemId) {
    const inserted = await supabase
      .from("work_items")
      .insert({
        title: prepared.title,
        description: prepared.description,
        status: "TO_DO",
        priority: matchingWorkItemPriority(mission.priority),
        due_date: new Date().toISOString().slice(0, 10),
        brand_id: contact.brand_id || contact.brand || mission.brandId || null,
        source_type: "crm",
        source_id: prepared.sourceId,
        assigned_agent: "nexus_property_match_autopilot",
        next_action: prepared.nextAction,
        ai_score: Math.max(0, Math.min(100, Math.round(mission.priorityScore))),
        metadata: prepared.metadata,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data?.id) {
      return NextResponse.json({ error: inserted.error?.message || "Matching work item could not be created" }, { status: 500 });
    }
    workItemId = String(inserted.data.id);
    created = true;
  }

  await runStore.appendStep(run.id, preparedMatchingTraceStep(run, mission, workItemId, String(profile.id)));
  run = (await runStore.load(run.id)) || run;

  return NextResponse.json({
    ok: true,
    created,
    run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
    workItem: {
      id: workItemId,
      sourceId: prepared.sourceId,
      title: prepared.title,
      nextAction: prepared.nextAction,
    },
    profileHealth: prepared.health,
    state: "prepared",
    downstream: {
      propertyMatchAutopilot: true,
      shortlistAutopilot: true,
      reviewRequiredBeforeCustomerSend: true,
    },
    safety: {
      externalActionExecuted: false,
      customerMessageSent: false,
      crmCriteriaChanged: false,
      buyerProfileChanged: false,
      pipelineChanged: false,
      note: "A governed CRM matching work item was seeded from the approved Buyer Profile. Existing property-match and shortlist workers continue the internal preparation chain.",
    },
  });
}
