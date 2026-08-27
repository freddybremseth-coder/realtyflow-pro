import { decideAutonomy } from "@/lib/agentic/policy-engine";
import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { operationIdempotencyKey, sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { RequestApprovalInput } from "@/services/tools/crm/request-approval";

export interface NexusPreparedDraftRef {
  id: string;
  contactRef: string;
  channel: string;
  subject?: string | null;
  body: string;
  status?: string | null;
}

export function preparedDraftIdFromRun(run: AgentRun, missionId: string) {
  for (let i = run.steps.length - 1; i >= 0; i -= 1) {
    const data = run.steps[i]?.data;
    if (data?.mission_id !== missionId || data?.transition !== "prepared") continue;
    const draftId = data?.draft_id;
    if (typeof draftId === "string" && draftId.trim()) return draftId.trim();
  }
  return null;
}

export function sendPersonalDecisionForPreparedDraft(run: AgentRun) {
  return decideAutonomy({
    actionClass: "send_personal",
    agentId: run.agentId,
    reversibility: "partial",
    recipients: 1,
    involvesPersonalData: true,
    channel: "email",
    permission: "requires-approval",
  });
}

export function preparedDraftApprovalInput(
  mission: NexusGrowthMission,
  run: AgentRun,
  draft: NexusPreparedDraftRef,
): RequestApprovalInput {
  const decision = sendPersonalDecisionForPreparedDraft(run);
  return {
    correlationId: run.correlationId || mission.opportunityId,
    idempotencyKey: operationIdempotencyKey(run.id, "request_approval", `send:${draft.id}`),
    runId: run.id,
    title: `Godkjenn utsending: ${mission.title}`,
    gatedActionClass: "send_personal",
    subjectType: "message_draft",
    subjectRef: draft.id,
    draftId: draft.id,
    customerRef: draft.contactRef,
    reason: `${mission.whyNow} Et konkret e-postutkast er klargjort og må godkjennes før utsending.`,
    risk: decision.risk,
    decisionMode: decision.mode,
  };
}

export function sendApprovalTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  approvalId: string,
  draftId: string,
  now = new Date(),
): AgentTraceStep {
  const decision = sendPersonalDecisionForPreparedDraft(run);
  return {
    id: `step_${sha256(`${run.id}:request-send-approval:${mission.id}:${draftId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "approval",
    label: "Prepared customer draft entered send approval",
    tool: "request_approval",
    inputSummary: `Prepared draft ${draftId}`,
    outputSummary: `Approval ${approvalId} created or reused; nothing sent.`,
    decisionMode: decision.mode,
    risk: decision.risk,
    outcome: "recommended",
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition: "request_send_approval",
      draft_id: draftId,
      approval_id: approvalId,
      gated_action_class: "send_personal",
      external_action_executed: false,
    },
  };
}
