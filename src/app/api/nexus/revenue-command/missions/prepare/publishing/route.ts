import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import {
  buildPublishingGrowthBrief,
  canPreparePublishingMission,
  preparedPublishingMissionTraceStep,
} from "@/lib/nexus-publishing-mission-preparer";
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

function preparedArtifactId(run: { steps: Array<{ data?: Record<string, unknown> }> }, missionId: string) {
  for (let i = run.steps.length - 1; i >= 0; i -= 1) {
    const data = run.steps[i]?.data;
    if (data?.mission_id !== missionId || data?.transition !== "prepared") continue;
    if (data?.artifact_type !== "book_growth_recommendation") continue;
    const artifactId = data?.artifact_id;
    if (typeof artifactId === "string" && artifactId.trim()) return artifactId.trim();
  }
  return null;
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
  if (!canPreparePublishingMission(mission, plan)) {
    return NextResponse.json({ error: "No registered publishing preparer for this mission", actionClass: plan.actionClass, capability: plan.capability }, { status: 409 });
  }

  const sourceRow = rows.find((row) => storeRowToOpportunity(row)?.id === mission.opportunityId);
  if (!sourceRow || sourceRow.source_system !== "book_growth") {
    return NextResponse.json({ error: "Mission is not backed by a verified Book Growth opportunity" }, { status: 409 });
  }

  const bookId = String(sourceRow.source_id || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookId)) {
    return NextResponse.json({ error: "Publishing opportunity has no valid book id" }, { status: 409 });
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const intake = await intakeNexusMission(runStore, mission, plan);
  let run = intake.run;

  const existingArtifactId = preparedArtifactId(run, mission.id);
  if (existingArtifactId) {
    return NextResponse.json({
      ok: true,
      created: false,
      run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
      artifact: { id: existingArtifactId, type: "book_growth_recommendation" },
      state: "prepared",
      safety: { externalActionExecuted: false, channelDataApplied: false },
    });
  }

  const { data: existingRecommendation, error: existingError } = await supabase
    .from("book_growth_recommendations")
    .select("id,status")
    .eq("book_id", bookId)
    .eq("recommendation_type", "nexus_growth_brief")
    .contains("evidence", { mission_id: mission.id })
    .in("status", ["pending", "approved", "applied", "measuring", "measured"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  let recommendationId = existingRecommendation?.id ? String(existingRecommendation.id) : "";
  let created = false;

  if (!recommendationId) {
    const brief = buildPublishingGrowthBrief(mission);
    const { data: inserted, error: insertError } = await supabase
      .from("book_growth_recommendations")
      .insert({
        book_id: bookId,
        series_id: null,
        channel: brief.channel,
        marketplace: brief.marketplace,
        recommendation_type: brief.recommendationType,
        current_value: null,
        proposed_value: brief.proposedValue,
        evidence: brief.evidence,
        confidence: null,
        expected_impact: brief.expectedImpact,
        status: "pending",
        created_by: "nexus_publishing_preparer_v1",
        correlation_id: run.correlationId || mission.opportunityId,
      })
      .select("id,status")
      .single();
    if (insertError || !inserted) return NextResponse.json({ error: insertError?.message || "Could not create Book Growth recommendation" }, { status: 500 });
    recommendationId = String(inserted.id);
    created = true;
  }

  await runStore.appendStep(run.id, preparedPublishingMissionTraceStep(run, mission, recommendationId));
  run = (await runStore.load(run.id)) || run;

  return NextResponse.json({
    ok: true,
    created,
    run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
    artifact: {
      id: recommendationId,
      type: "book_growth_recommendation",
      recommendationType: "nexus_growth_brief",
      bookId,
    },
    state: "prepared",
    safety: {
      externalActionExecuted: false,
      channelDataApplied: false,
      sendApprovalCreated: false,
      note: "A pending internal Book Growth recommendation was prepared. No retailer, channel, customer or publishing data was applied.",
    },
  });
}
