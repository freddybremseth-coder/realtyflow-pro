import type { AgentRun, AgentTraceStep } from "@/lib/agentic/schemas";
import { sha256 } from "@/lib/agentic/ids";
import type { NexusGrowthMission } from "@/lib/nexus-growth-mission";
import type { NexusMissionAgenticPlan } from "@/lib/nexus-mission-agentic";

export interface NexusPublishingRecommendationDraft {
  recommendationType: "nexus_growth_brief";
  channel: "nexus";
  marketplace: "global";
  proposedValue: Record<string, unknown>;
  evidence: Record<string, unknown>;
  expectedImpact: string;
}

export function canPreparePublishingMission(mission: NexusGrowthMission, plan: NexusMissionAgenticPlan) {
  return (
    mission.pipelineId === "publishing" &&
    plan.actionClass === "draft" &&
    plan.capability === "prepare_only" &&
    plan.effectiveMode === "draft-first"
  );
}

export function buildPublishingGrowthBrief(mission: NexusGrowthMission): NexusPublishingRecommendationDraft {
  return {
    recommendationType: "nexus_growth_brief",
    channel: "nexus",
    marketplace: "global",
    proposedValue: {
      action: mission.nextAction,
      desired_outcome: mission.desiredOutcome,
      stage: mission.stageId,
      owner_role: mission.role,
      due_in_hours: mission.dueInHours,
    },
    evidence: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      brand_id: mission.brandId,
      pipeline_id: mission.pipelineId,
      stage_id: mission.stageId,
      priority: mission.priority,
      priority_score: mission.priorityScore,
      why_now: mission.whyNow,
      source: "nexus_revenue_command",
    },
    expectedImpact: mission.desiredOutcome,
  };
}

export function preparedPublishingMissionTraceStep(
  run: AgentRun,
  mission: NexusGrowthMission,
  recommendationId: string,
  now = new Date(),
): AgentTraceStep {
  return {
    id: `step_${sha256(`${run.id}:prepared-publishing:${mission.id}:${recommendationId}`).slice(0, 24)}`,
    ts: now.toISOString(),
    kind: "tool_result",
    label: "Publishing growth brief prepared",
    inputSummary: mission.nextAction,
    outputSummary: `Book Growth recommendation ${recommendationId} prepared; no channel data applied.`,
    outcome: "executed",
    data: {
      mission_id: mission.id,
      opportunity_id: mission.opportunityId,
      transition: "prepared",
      artifact_type: "book_growth_recommendation",
      artifact_id: recommendationId,
      recommendation_type: "nexus_growth_brief",
      external_action_executed: false,
      channel_data_applied: false,
    },
  };
}
