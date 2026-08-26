import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import { makeSupabaseAgentRunStore } from "@/services/agentic/adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

  const snapshot = buildNexusRevenueCommandCenter((data || []) as NexusOpportunityStoreRow[]);
  const mission = snapshot.growthMissions.find((item) => item.id === missionId);
  if (!mission) return NextResponse.json({ error: "Mission not found in current Revenue Command snapshot" }, { status: 404 });

  const plan = snapshot.agenticPlans.find((item) => item.missionId === missionId);
  if (!plan) return NextResponse.json({ error: "Agentic plan not found for mission" }, { status: 500 });

  const store = makeSupabaseAgentRunStore(supabase);
  const result = await intakeNexusMission(store, mission, plan);

  return NextResponse.json({
    ok: true,
    created: result.created,
    run: {
      id: result.run.id,
      status: result.run.status,
      outcome: result.run.outcome ?? null,
      agentId: result.run.agentId,
      idempotencyKey: result.run.idempotencyKey ?? null,
      startedAt: result.run.startedAt,
    },
    mission: {
      id: mission.id,
      opportunityId: mission.opportunityId,
      brandId: mission.brandId,
      pipelineId: mission.pipelineId,
      stageId: mission.stageId,
      role: mission.role,
      objective: mission.objective,
      href: mission.href,
    },
    governance: {
      capability: plan.capability,
      effectiveMode: plan.effectiveMode,
      risk: plan.policyDecision.risk,
      guardrailReason: plan.guardrailReason,
      externalSideEffectAllowed: plan.externalSideEffectAllowed,
    },
    safety: {
      externalActionExecuted: false,
      approvalCreated: false,
      draftCreated: false,
      note: "Mission intake only persists governed intent in agent_runs. Preparation and approval are separate orchestration steps.",
    },
  });
}
