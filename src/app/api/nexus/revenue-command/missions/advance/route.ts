import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { ToolRegistry } from "@/lib/agentic/tool-registry";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import {
  missionApprovalInput,
  missionGovernanceTraceStep,
  missionGovernanceTransition,
} from "@/lib/nexus-mission-governance";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import {
  makeApprovalStore,
  makeSupabaseAgentRunStore,
} from "@/services/agentic/adapters";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function hasTransition(run: { steps: Array<{ data?: Record<string, unknown> }> }, transition: string) {
  return run.steps.some((step) => step.data?.transition === transition);
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

  const runStore = makeSupabaseAgentRunStore(supabase);
  const intake = await intakeNexusMission(runStore, mission, plan);
  let run = intake.run;
  const transition = missionGovernanceTransition(plan);
  const now = new Date();

  if (transition === "complete_recommendation") {
    if (run.status !== "completed" || run.outcome !== "recommended") {
      if (!hasTransition(run, transition)) {
        await runStore.appendStep(run.id, missionGovernanceTraceStep(run, mission, plan, transition, now));
      }
      await runStore.setOutcome(run.id, "recommended");
      await runStore.setStatus(run.id, "completed", now.toISOString());
      run = (await runStore.load(run.id)) || run;
    }
    return NextResponse.json({
      ok: true,
      transition,
      run: { id: run.id, status: "completed", outcome: "recommended" },
      approval: null,
      safety: { externalActionExecuted: false, draftCreated: false },
    });
  }

  if (transition === "await_preparer") {
    if (!hasTransition(run, transition)) {
      await runStore.appendStep(run.id, missionGovernanceTraceStep(run, mission, plan, transition, now));
      run = (await runStore.load(run.id)) || run;
    }
    return NextResponse.json({
      ok: true,
      transition,
      run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
      approval: null,
      safety: {
        externalActionExecuted: false,
        draftCreated: false,
        note: "Mission remains pending until a registered domain preparer creates a real artifact.",
      },
    });
  }

  if (transition === "request_approval") {
    const registry = new ToolRegistry();
    registry.register(buildRequestApprovalTool(makeApprovalStore(supabase)));
    const approvalInput = missionApprovalInput(mission, plan, run);
    const approvalResult = await registry.run("request_approval", approvalInput, {
      role: "OWNER",
      correlationId: approvalInput.correlationId,
      idempotencyKey: approvalInput.idempotencyKey,
    });

    if (!approvalResult.ok) {
      return NextResponse.json({ error: approvalResult.error || "Approval request failed" }, { status: 500 });
    }
    if (!approvalResult.data) {
      return NextResponse.json({
        error: "Approval tool did not create or return an approval record",
        decision: approvalResult.decision ?? null,
      }, { status: 409 });
    }

    const approval = approvalResult.data as { id: string; created: boolean };
    if (!hasTransition(run, transition)) {
      await runStore.appendStep(
        run.id,
        missionGovernanceTraceStep(run, mission, plan, transition, now, {
          approval_id: approval.id,
          approval_created: approval.created,
        }),
      );
    }
    if (run.status !== "waiting_approval") {
      await runStore.setStatus(run.id, "waiting_approval");
    }
    run = (await runStore.load(run.id)) || run;

    return NextResponse.json({
      ok: true,
      transition,
      run: { id: run.id, status: "waiting_approval", outcome: run.outcome ?? null },
      approval,
      governance: {
        effectiveMode: plan.effectiveMode,
        risk: plan.policyDecision.risk,
        gatedActionClass: plan.actionClass,
      },
      safety: {
        externalActionExecuted: false,
        draftCreated: false,
        note: "Only an approval record was created. The underlying action has not executed.",
      },
    });
  }

  if (!hasTransition(run, transition)) {
    await runStore.appendStep(run.id, missionGovernanceTraceStep(run, mission, plan, transition, now));
  }
  return NextResponse.json({
    ok: true,
    transition,
    run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
    approval: null,
    safety: {
      externalActionExecuted: false,
      draftCreated: false,
      note: "No registered mission executor is allowed to run automatically in this version.",
    },
  });
}
