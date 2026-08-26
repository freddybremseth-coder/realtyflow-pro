import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import type { AgentRunStore } from "@/lib/agentic/run-store";
import { newRunId, sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export function nexusMissionRunIdempotencyKey(mission: NexusGrowthMission) {
  return `mission_${sha256(`nexus-revenue-command:${mission.id}:v1`).slice(0, 40)}`;
}

export function buildNexusMissionAgentRun(
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
  now = new Date(),
  runId = newRunId(now.getTime()),
): AgentRun {
  const ts = now.toISOString();
  const idempotencyKey = nexusMissionRunIdempotencyKey(mission);
  const step: AgentTraceStep = {
    id: `step_${sha256(`${runId}:mission-intake`).slice(0, 24)}`,
    ts,
    kind: "decision",
    label: "Nexus mission accepted for governed execution",
    inputSummary: mission.nextAction,
    outputSummary: plan.guardrailReason || `Policy mode: ${plan.effectiveMode}`,
    decisionMode: plan.effectiveMode,
    risk: plan.policyDecision.risk,
    data: {
      source: "nexus_revenue_command",
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      brand_id: mission.brandId,
      pipeline_id: mission.pipelineId,
      stage_id: mission.stageId,
      role: mission.role,
      objective: mission.objective,
      desired_outcome: mission.desiredOutcome,
      due_in_hours: mission.dueInHours,
      priority: mission.priority,
      priority_score: mission.priorityScore,
      action_class: plan.actionClass,
      capability: plan.capability,
      external_side_effect_allowed: plan.externalSideEffectAllowed,
      href: mission.href,
    },
  };

  return {
    id: runId,
    agentId: plan.agentId,
    goal: mission.desiredOutcome,
    status: "pending",
    correlationId: mission.opportunityId,
    idempotencyKey,
    startedAt: ts,
    steps: [step],
    decision: plan.policyDecision,
  };
}

export async function intakeNexusMission(
  store: AgentRunStore,
  mission: NexusGrowthMission,
  plan: NexusMissionAgenticPlan,
  now = new Date(),
) {
  const idempotencyKey = nexusMissionRunIdempotencyKey(mission);
  const existing = await store.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { ok: true as const, created: false as const, run: existing, plan };
  }

  const run = buildNexusMissionAgentRun(mission, plan, now);
  await store.save(run);
  return { ok: true as const, created: true as const, run, plan };
}
