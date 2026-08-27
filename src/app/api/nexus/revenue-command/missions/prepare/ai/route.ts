import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { operationIdempotencyKey } from "@/lib/agentic/ids";
import { ToolRegistry } from "@/lib/agentic/tool-registry";
import {
  canPrepareAiDemoMission,
  composeAiDemoMissionDraft,
  preparedAiMissionTraceStep,
} from "@/lib/nexus-ai-mission-preparer";
import { intakeNexusMission } from "@/lib/nexus-mission-intake";
import { buildNexusRevenueCommandCenter } from "@/lib/nexus-revenue-command-center";
import { storeRowToOpportunity, type NexusOpportunityStoreRow } from "@/lib/nexus-opportunity-store";
import { makeDraftStore, makeSupabaseAgentRunStore } from "@/services/agentic/adapters";
import { buildCreateDraftTool } from "@/services/tools/communications/create-draft";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function existingPreparedDraft(run: { steps: Array<{ data?: Record<string, unknown> }> }) {
  return [...run.steps].reverse().find((step) => step.data?.transition === "prepared" && typeof step.data?.draft_id === "string");
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
  if (!canPrepareAiDemoMission(mission, plan)) {
    return NextResponse.json({ error: "No registered AI/SaaS draft preparer for this mission", actionClass: plan.actionClass, capability: plan.capability }, { status: 409 });
  }

  const sourceRow = rows.find((row) => storeRowToOpportunity(row)?.id === mission.opportunityId);
  if (!sourceRow || sourceRow.source_system !== "chatgenius_demosites" || !sourceRow.source_id) {
    return NextResponse.json({ error: "Mission has no verified DemoSites source link" }, { status: 409 });
  }

  const { data: order, error: orderError } = await supabase
    .from("demo_site_orders")
    .select("id,customer_name,customer_email,company_name,package_id,status,billing_status,preview_url,claim_url")
    .eq("id", sourceRow.source_id)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  const email = typeof order?.customer_email === "string" ? order.customer_email.trim() : "";
  if (!order || !email) return NextResponse.json({ error: "Verified DemoSites customer email required before creating an email draft" }, { status: 409 });

  const runStore = makeSupabaseAgentRunStore(supabase);
  const intake = await intakeNexusMission(runStore, mission, plan);
  let run = intake.run;
  const existing = existingPreparedDraft(run);
  if (existing) {
    return NextResponse.json({
      ok: true,
      created: false,
      run: { id: run.id, status: run.status },
      draft: { id: String(existing.data?.draft_id || ""), channel: "email", to: email },
      state: "prepared",
      safety: { externalActionExecuted: false, approvalCreated: false },
    });
  }

  const prepared = composeAiDemoMissionDraft(mission, {
    id: String(order.id),
    customer_name: order.customer_name,
    customer_email: email,
    company_name: order.company_name,
    package_id: order.package_id,
    status: order.status,
    billing_status: order.billing_status,
    preview_url: order.preview_url,
    claim_url: order.claim_url,
  });

  const draftKey = operationIdempotencyKey(run.id, "create_draft", mission.id);
  const registry = new ToolRegistry();
  registry.register(buildCreateDraftTool(makeDraftStore(supabase)));
  const draftResult = await registry.run<unknown, { id: string; created: boolean }>("create_draft", {
    correlationId: run.correlationId || mission.opportunityId,
    idempotencyKey: draftKey,
    contactRef: email,
    channel: "email",
    subject: prepared.subject,
    body: prepared.body,
    propertyIds: [],
  }, {
    role: "OWNER",
    correlationId: run.correlationId || mission.opportunityId,
    idempotencyKey: draftKey,
  });

  if (!draftResult.ok || !draftResult.data) {
    return NextResponse.json({ error: draftResult.error || "AI/SaaS draft preparation failed", decision: draftResult.decision ?? null }, { status: 409 });
  }

  await runStore.appendStep(run.id, preparedAiMissionTraceStep(run, mission, draftResult.data.id));
  run = (await runStore.load(run.id)) || run;

  return NextResponse.json({
    ok: true,
    created: draftResult.data.created,
    run: { id: run.id, status: run.status, outcome: run.outcome ?? null },
    draft: { id: draftResult.data.id, channel: "email", to: email, subject: prepared.subject, body: prepared.body },
    state: "prepared",
    safety: {
      externalActionExecuted: false,
      approvalCreated: false,
      note: "A real internal AI/SaaS follow-up draft was persisted. No message was sent and no send approval was created.",
    },
  });
}
