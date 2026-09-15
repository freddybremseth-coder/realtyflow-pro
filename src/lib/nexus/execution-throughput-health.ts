export type ExecutionThroughputState = "ACTIVE" | "DEGRADED" | "IDLE";

export interface ExecutionThroughputEvent {
  id?: string | null;
  event_type?: string | null;
  contact_id?: string | null;
  source_system?: string | null;
  source_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ExecutionThroughputHealth {
  state: ExecutionThroughputState;
  recommendations: number;
  executedRecommendations: number;
  openRecommendationBacklog: number;
  executionRate: number;
  linkedExecutionCoverage: number;
  legacyApprovalEventsMasqueradingAsExecuted: number;
  untraceableActualExecutions: number;
  reasons: string[];
}

function text(value: unknown) {
  return String(value || "").trim();
}

function metadata(event: ExecutionThroughputEvent) {
  return event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
}

function recommendationId(event: ExecutionThroughputEvent) {
  return text(metadata(event).recommendation_id) || text(event.source_id) || text(event.id);
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function measureExecutionThroughputHealth(events: ExecutionThroughputEvent[]): ExecutionThroughputHealth {
  const recommendationIds = new Set(
    events
      .filter((event) => event.event_type === "automation_recommended" && event.source_system === "nexus_revenue_brain")
      .map(recommendationId)
      .filter(Boolean),
  );

  const executionRows = events.filter((event) =>
    event.event_type === "automation_executed"
    && event.source_system === "nexus_revenue_brain"
    && text(metadata(event).recommendation_id),
  );
  const executedRecommendationIds = new Set(executionRows.map(recommendationId).filter(Boolean));
  const executedRecommendations = [...executedRecommendationIds].filter((id) => recommendationIds.has(id)).length;
  const recommendations = recommendationIds.size;
  const openRecommendationBacklog = Math.max(0, recommendations - executedRecommendations);

  const linkedExecutions = executionRows.filter((event) => text(event.contact_id) && recommendationIds.has(recommendationId(event))).length;

  const legacyApprovalEventsMasqueradingAsExecuted = events.filter((event) =>
    event.event_type === "automation_executed" && text(metadata(event).agentic_outcome) === "approved",
  ).length;

  const actualAgenticExecutions = events.filter((event) =>
    event.event_type === "automation_executed"
    && (event.source_system === "agentic_executor" || text(metadata(event).agentic_outcome) === "executed"),
  );
  const untraceableActualExecutions = actualAgenticExecutions.filter((event) => {
    const meta = metadata(event);
    return !text(event.contact_id)
      && !text(event.source_id)
      && !text(meta.run_id)
      && !text(meta.subject_ref)
      && !text(meta.approval_id);
  }).length;

  const state: ExecutionThroughputState = recommendations === 0
    ? "IDLE"
    : executedRecommendations === 0
      ? "DEGRADED"
      : "ACTIVE";

  const reasons: string[] = [];
  if (state === "DEGRADED") reasons.push("recommendation_backlog_without_execution");
  if (legacyApprovalEventsMasqueradingAsExecuted > 0) reasons.push("legacy_approval_events_misclassified_as_execution");
  if (untraceableActualExecutions > 0) reasons.push("untraceable_execution_receipts");

  return {
    state,
    recommendations,
    executedRecommendations,
    openRecommendationBacklog,
    executionRate: pct(executedRecommendations, recommendations),
    linkedExecutionCoverage: pct(linkedExecutions, executionRows.length),
    legacyApprovalEventsMasqueradingAsExecuted,
    untraceableActualExecutions,
    reasons,
  };
}
