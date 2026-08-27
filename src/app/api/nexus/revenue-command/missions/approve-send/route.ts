import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { ToolRegistry } from "@/lib/agentic/tool-registry";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { missionIdFromRun, type NexusMissionRunRow } from "@/lib/nexus-mission-state";
import {
  preparedDraftApprovalInput,
  preparedDraftIdFromRun,
  sendApprovalTraceStep,
  type NexusPreparedDraftRef,
} from "@/lib/nexus-prepared-send-approval";
import type { NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import { makeApprovalStore, makeSupabaseAgentRunStore } from "@/services/agentic/adapters";
import { buildRequestApprovalTool } from "@/services/tools/crm/request-approval";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function hasSendApprovalTransition(run: { steps: Array<{ data?: Record<string, unknown> }> }, missionId: string, draftId: string) {
  return run.steps.some((step) =>
    step.data?.mission_id === missionId &&
    step.data?.transition === "request_send_approval" &&
    step.data?.draft_id === draftId,
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

  const [{ data: opportunityRows, error: opportunityError }, { data: runRows, error: runError }] = await Promise.all([
    supabase
      .from("nexus_business_opportunities")
      .select("contact_id,brand_id,offer_id,pipeline_id,stage_id,lifecycle_phase,opportunity_state,title,reason,next_action,priority,priority_score,value,currency,route_confidence,route_reason,source_system,source_id,source_updated_at,last_activity_at,metadata")
      .in("opportunity_state", ["active", "won"])
      .order("priority_score", { ascending: false })
      .limit(1000),
    supabase
      .from("agent_runs")
      .select("*")
      .like("agent_id", "nexus_%")
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  if (opportunityError) return NextResponse.json({ error: opportunityError.message }, { status: 500 });
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });

  const snapshot = buildNexusRevenueCommandCenter((opportunityRows || []) as NexusOpportunityStoreRow[]);
  const mission = snapshot.growthMissions.find((item) => item.id === missionId);
  if (!mission) {
    return NextResponse.json({
      error: "Mission is no longer current. Refresh Revenue Command before requesting send approval.",
      staleMission: true,
    }, { status: 409 });
  }

  const runStore = makeSupabaseAgentRunStore(supabase);
  const candidate = ((runRows || []) as NexusMissionRunRow[]).find((row) => missionIdFromRun(row) === missionId);
  if (!candidate) return NextResponse.json({ error: "No durable Nexus run found for mission" }, { status: 409 });

  const run = await runStore.load(candidate.id);
  if (!run) return NextResponse.json({ error: "Mission run could not be loaded" }, { status: 409 });

  const draftId = preparedDraftIdFromRun(run, missionId);
  if (!draftId) {
    return NextResponse.json({ error: "Mission has no verified prepared draft" }, { status: 409 });
  }

  const { data: draftRow, error: draftError } = await supabase
    .from("agentic_drafts")
    .select("id,contact_ref,channel,subject,body,status")
    .eq("id", draftId)
    .maybeSingle();
  if (draftError) return NextResponse.json({ error: draftError.message }, { status: 500 });
  if (!draftRow) return NextResponse.json({ error: "Prepared draft not found" }, { status: 409 });

  const draft: NexusPreparedDraftRef = {
    id: String(draftRow.id),
    contactRef: String(draftRow.contact_ref || "").trim(),
    channel: String(draftRow.channel || "").trim().toLowerCase(),
    subject: draftRow.subject ? String(draftRow.subject) : null,
    body: String(draftRow.body || ""),
    status: draftRow.status ? String(draftRow.status) : null,
  };

  if (draft.status !== "draft" || draft.channel !== "email" || !draft.contactRef || !draft.body.trim()) {
    return NextResponse.json({ error: "Prepared draft is not eligible for send approval" }, { status: 409 });
  }

  const registry = new ToolRegistry();
  registry.register(buildRequestApprovalTool(makeApprovalStore(supabase)));
  const approvalInput = preparedDraftApprovalInput(mission, run, draft);
  const approvalResult = await registry.run("request_approval", approvalInput, {
    role: "OWNER",
    correlationId: approvalInput.correlationId,
    idempotencyKey: approvalInput.idempotencyKey,
  });

  if (!approvalResult.ok) {
    return NextResponse.json({ error: approvalResult.error || "Send approval request failed" }, { status: 500 });
  }
  if (!approvalResult.data) {
    return NextResponse.json({
      error: "Approval tool did not create or return an approval record",
      decision: approvalResult.decision ?? null,
    }, { status: 409 });
  }

  const approval = approvalResult.data as { id: string; created: boolean };
  if (!hasSendApprovalTransition(run, missionId, draftId)) {
    await runStore.appendStep(run.id, sendApprovalTraceStep(run, mission, approval.id, draftId));
  }
  if (run.status !== "waiting_approval") await runStore.setStatus(run.id, "waiting_approval");

  return NextResponse.json({
    ok: true,
    missionId,
    runId: run.id,
    draftId,
    approval,
    governance: {
      gatedActionClass: "send_personal",
      decisionMode: approvalInput.decisionMode ?? null,
      risk: approvalInput.risk ?? null,
    },
    safety: {
      externalActionExecuted: false,
      messageSent: false,
      note: "Only a send approval was created or reused. The prepared draft remains unsent until the existing Approval Center/executor flow completes.",
    },
  });
}
