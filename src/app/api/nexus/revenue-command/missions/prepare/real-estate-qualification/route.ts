import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import {
  buildRealEstateQualificationBrief,
  canPrepareRealEstateQualificationMission,
  preparedQualificationTraceStep,
} from "@/lib/nexus-real-estate-qualification-preparer";
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

function preparedQualificationArtifact(run: { steps: Array<{ data?: Record<string, unknown> }> }) {
  return [...run.steps].reverse().find(
    (step) => step.data?.transition === "prepared" && step.data?.artifact_type === "qualification_work_item" && typeof step.data?.artifact_id === "string",
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
  if (!canPrepareRealEstateQualificationMission(mission, plan)) {
    return NextResponse.json({
      error: "No registered real-estate qualification preparer for this mission",
      actionClass: plan.actionClass,
      capability: plan.capability,
    }, { status: 409 });
  }

  const sourceRow = rows.find((row) => storeRowToOpportunity(row)?.id === mission.opportunityId);
  if (!sourceRow?.contact_id) {
    return NextResponse.json({ error: "Mission has no verified CRM contact link" }, { status: 409 });
  }

  const [contactResult, profileResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,phone,pipeline_value,property_interest,next_followup,notes,brand_id")
      .eq("id", sourceRow.contact_id)
      .maybeSingle(),
    supabase
      .from("buyer_profiles")
      .select("id,budget_amount,budget_currency,purchase_readiness,summary,status,version")
      .eq("contact_id", sourceRow.contact_id)
      .neq("status", "archived")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (contactResult.error) return NextResponse.json({ error: contactResult.error.message }, { status: 500 });
  if (profileResult.error) return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  const contact = contactResult.data;
  if (!contact) return NextResponse.json({ error: "Verified CRM contact not found" }, { status: 409 });

  let criteria: Array<Record<string, unknown>> = [];
  if (profileResult.data?.id) {
    const criteriaResult = await supabase
      .from("buyer_profile_criteria")
      .select("key,other_key,criterion_type,value,weight,severity,source,source_text,confidence,customer_confirmed,approval_status,active")
      .eq("buyer_profile_id", profileResult.data.id)
      .eq("active", true);
    if (criteriaResult.error) return NextResponse.json({ error: criteriaResult.error.message }, { status: 500 });
    criteria = (criteriaResult.data || []) as Array<Record<string, unknown>>;
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const intake = await intakeNexusMission(runStore, mission, plan);
  let run = intake.run;
  const existingPrepared = preparedQualificationArtifact(run);
  if (existingPrepared) {
    return NextResponse.json({
      ok: true,
      created: false,
      run: { id: run.id, status: run.status },
      workItem: { id: String(existingPrepared.data?.artifact_id || "") },
      state: "prepared",
      safety: { externalActionExecuted: false, crmCriteriaChanged: false },
    });
  }

  const brief = buildRealEstateQualificationBrief(
    mission,
    contact,
    profileResult.data || null,
    criteria as never,
  );

  const existingWorkItem = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "ai_agent")
    .eq("source_id", mission.id)
    .limit(1)
    .maybeSingle();
  if (existingWorkItem.error) return NextResponse.json({ error: existingWorkItem.error.message }, { status: 500 });

  let workItemId = existingWorkItem.data?.id ? String(existingWorkItem.data.id) : "";
  let created = false;
  if (!workItemId) {
    const inserted = await supabase
      .from("work_items")
      .insert({
        title: brief.title,
        description: brief.description,
        status: "TO_DO",
        priority: mission.priority,
        due_date: new Date().toISOString().slice(0, 10),
        brand_id: contact.brand_id || mission.brandId || null,
        source_type: "ai_agent",
        source_id: mission.id,
        assigned_agent: "lead_intelligence",
        next_action: brief.nextAction,
        ai_score: Math.max(0, Math.min(100, Math.round(mission.priorityScore))),
        metadata: brief.metadata,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data?.id) {
      return NextResponse.json({ error: inserted.error?.message || "Qualification work item could not be created" }, { status: 500 });
    }
    workItemId = String(inserted.data.id);
    created = true;
  }

  await runStore.appendStep(run.id, preparedQualificationTraceStep(run, mission, workItemId));
  run = (await runStore.load(run.id)) || run;

  return NextResponse.json({
    ok: true,
    created,
    run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
    workItem: {
      id: workItemId,
      title: brief.title,
      nextAction: brief.nextAction,
      completeness: brief.completeness,
      missing: brief.missing,
      lifestyle: brief.lifestyle,
    },
    state: "prepared",
    safety: {
      externalActionExecuted: false,
      crmCriteriaChanged: false,
      buyerProfileChanged: false,
      note: "An internal qualification/matching work item was prepared. No customer message was sent and no CRM criteria were changed.",
    },
  });
}
