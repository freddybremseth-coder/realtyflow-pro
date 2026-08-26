import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { operationIdempotencyKey, sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";
import type { RequestApprovalInput } from "@/services/tools/crm/request-approval";

export type NexusMissionGovernanceTransition =
  | "complete_recommendation"
  | "await_preparer"
  | "request_approval"
  | "await_executor";

export function missionGovernanceTransition(plan: NexusMissionAgenticPlan): NexusMissionGovernanceTransition {
  if (plan.capability === "recommendation_only") return "complete_recommendation";
  if (plan.capability === "prepare_only" || plan.effectiveMode === "draft-first") return "await_preparer";
  if (
    plan.capability === "approval_required" ||
    plan.effectiveMode === "manual-review" ||
    plan.effectiveMode === "human-required"
  ) {
    return "request_approval";
  }
  return "await_executor";
}

export function missionApprovalInput(
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
  run: AgentRun,
): RequestApprovalInput {
  const valueEur = mission.currency === "EUR" && Number.isFinite(Number(mission.expectedValue))
    ? Number(mission.expectedValue)
    : undefined;

  return {
    correlationId: run.correlationId || mission.opportunityId,
    idempotencyKey: operationIdempotencyKey(run.id, "request_approval", mission.id),
    runId: run.id,
    title: `Godkjenn neste steg: ${mission.title}`,
    gatedActionClass: plan.actionClass,
    subjectType: "generic_agent_action",
    subjectRef: mission.id,
    reason: `${mission.whyNow} Neste handling: ${mission.nextAction}`,
    risk: plan.policyDecision.risk,
    decisionMode: plan.effectiveMode,
    estimatedOpportunityEur: valueEur,
  };
}

export function missionGovernanceTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
  transition: NexusMissionGovernanceTransition,
  now = new Date(),
  details: Record<string, unknown> = {},
): AgentTraceStep {
  const ts = now.toISOString();
  return {
    id: `step_${sha256(`${run.id}:${transition}:${mission.id}`).slice(0, 24)}`,
    ts,
    kind: transition === "request_approval" ? "approval" : "decision",
    label:
      transition === "complete_recommendation"
        ? "Nexus recommendation completed"
        : transition === "request_approval"
          ? "Nexus mission entered approval gateway"
          : transition === "await_preparer"
            ? "Nexus mission awaits domain preparation"
            : "Nexus mission awaits registered executor",
    inputSummary: mission.nextAction,
    outputSummary:
      transition === "request_approval"
        ? "Human decision required before the underlying action may proceed."
        : plan.guardrailReason || `Governance transition: ${transition}`,
    decisionMode: plan.effectiveMode,
    risk: plan.policyDecision.risk,
    outcome: transition === "complete_recommendation" ? "recommended" : undefined,
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition,
      action_class: plan.actionClass,
      capability: plan.capability,
      ...details,
    },
  };
}
