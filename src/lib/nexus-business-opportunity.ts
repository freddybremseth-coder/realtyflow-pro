import {
  businessPipelineDefinition,
  businessStage,
  type BusinessPipelineId,
  type NexusLifecyclePhase,
} from "@/lib/business-pipeline-registry";

export type NexusOpportunityPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type NexusOpportunityRouteConfidence = "high" | "medium" | "low" | "unknown";

export interface NexusBusinessOpportunityInput {
  id: string;
  brandId: string;
  offerId?: string | null;
  pipelineId: BusinessPipelineId;
  stageId: string;
  title: string;
  reason?: string | null;
  nextAction?: string | null;
  priority?: NexusOpportunityPriority | null;
  priorityScore?: number | null;
  value?: number | null;
  currency?: string | null;
  sourceSystem: string;
  sourceId?: string | null;
  href: string;
  routeConfidence?: NexusOpportunityRouteConfidence | null;
  routeReason?: string | null;
  updatedAt?: string | null;
}

export interface NexusBusinessOpportunity {
  id: string;
  brandId: string;
  offerId: string | null;
  pipelineId: BusinessPipelineId;
  pipelineName: string;
  customerLabel: string;
  opportunityLabel: string;
  valueModel: string;
  successEvent: string;
  stageId: string;
  stageLabel: string;
  phase: NexusLifecyclePhase;
  title: string;
  reason: string | null;
  nextAction: string;
  priority: NexusOpportunityPriority;
  priorityScore: number;
  value: number | null;
  currency: string | null;
  sourceSystem: string;
  sourceId: string | null;
  href: string;
  routeConfidence: NexusOpportunityRouteConfidence;
  routeReason: string | null;
  terminal: boolean;
  updatedAt: string | null;
}

function clampScore(value: unknown) {
  const score = Number(value ?? 0);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function priorityFromScore(score: number): NexusOpportunityPriority {
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

export function buildNexusBusinessOpportunity(
  input: NexusBusinessOpportunityInput,
): NexusBusinessOpportunity | null {
  const pipeline = businessPipelineDefinition(input.pipelineId);
  if (!pipeline) return null;
  const stage = businessStage(input.pipelineId, input.stageId);
  if (!stage) return null;

  const priorityScore = clampScore(input.priorityScore);
  return {
    id: input.id,
    brandId: input.brandId,
    offerId: input.offerId ?? null,
    pipelineId: pipeline.id,
    pipelineName: pipeline.name,
    customerLabel: pipeline.customerLabel,
    opportunityLabel: pipeline.opportunityLabel,
    valueModel: pipeline.valueModel,
    successEvent: pipeline.successEvent,
    stageId: stage.id,
    stageLabel: stage.label,
    phase: stage.phase,
    title: input.title,
    reason: input.reason ?? null,
    nextAction: input.nextAction?.trim() || stage.defaultNextAction,
    priority: input.priority ?? priorityFromScore(priorityScore),
    priorityScore,
    value: Number.isFinite(Number(input.value)) ? Number(input.value) : null,
    currency: input.currency ?? null,
    sourceSystem: input.sourceSystem,
    sourceId: input.sourceId ?? null,
    href: input.href,
    routeConfidence: input.routeConfidence ?? "unknown",
    routeReason: input.routeReason ?? null,
    terminal: Boolean(stage.terminal),
    updatedAt: input.updatedAt ?? null,
  };
}

export function isBusinessStageValid(pipelineId: BusinessPipelineId, stageId: string) {
  return Boolean(businessStage(pipelineId, stageId));
}
