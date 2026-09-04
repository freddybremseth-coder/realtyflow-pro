export type TrajectoryPeriod = "historical" | "current" | "future";

export type TrajectoryClaim = {
  id: string;
  predicate: string;
  value_text: string | null;
  claim_type: string;
  status: string;
  confidence: number | null;
  privacy_level: string;
  source_id: string | null;
  source_excerpt: string | null;
  valid_from: string | null;
  valid_to: string | null;
  confirmed_at: string | null;
  updated_at: string;
};

export type TrajectoryGoal = {
  id: string;
  title: string;
  description: string | null;
  domain: string | null;
  goal_type: string | null;
  priority: number | null;
  status: string;
  target_date: string | null;
  why_it_matters: string | null;
  privacy_level: string;
  updated_at: string;
};

export type TrajectoryItem = {
  id: string;
  period: TrajectoryPeriod;
  kind: "claim" | "goal";
  label: string;
  detail: string | null;
  status: string;
  confidence: number | null;
  privacyLevel: string;
  sourceId: string | null;
  sourceExcerpt: string | null;
  evidenceRule: string;
  updatedAt: string;
};

const HISTORICAL_PREDICATE_MARKERS = [
  "history", "historical", "past", "previous", "former", "turning_point", "experience", "learned_from", "background",
];

function explicitlyHistorical(claim: TrajectoryClaim, now: Date): boolean {
  if (claim.valid_to && new Date(claim.valid_to).getTime() < now.getTime()) return true;
  const predicate = claim.predicate.toLowerCase().replace(/[-\s]+/g, "_");
  return HISTORICAL_PREDICATE_MARKERS.some((marker) => predicate.includes(marker));
}

export function buildTrajectory(claims: TrajectoryClaim[], goals: TrajectoryGoal[], now = new Date()) {
  const eligibleClaims = claims.filter((claim) => ["validated", "canonical"].includes(claim.status));
  const historical: TrajectoryItem[] = [];
  const current: TrajectoryItem[] = [];

  for (const claim of eligibleClaims) {
    const isHistorical = explicitlyHistorical(claim, now);
    const item: TrajectoryItem = {
      id: claim.id,
      period: isHistorical ? "historical" : "current",
      kind: "claim",
      label: claim.value_text || claim.predicate,
      detail: claim.value_text ? claim.predicate : null,
      status: claim.status,
      confidence: claim.confidence,
      privacyLevel: claim.privacy_level,
      sourceId: claim.source_id,
      sourceExcerpt: claim.source_excerpt,
      evidenceRule: isHistorical
        ? "Explicit past marker in predicate or an ended validity period."
        : "Validated/canonical claim with no explicit past marker; shown as current context, not permanent identity.",
      updatedAt: claim.updated_at,
    };
    (isHistorical ? historical : current).push(item);
  }

  const future: TrajectoryItem[] = goals
    .filter((goal) => !["completed", "cancelled", "archived"].includes(goal.status))
    .map((goal) => ({
      id: goal.id,
      period: "future" as const,
      kind: "goal" as const,
      label: goal.title,
      detail: goal.why_it_matters || goal.description,
      status: goal.status,
      confidence: null,
      privacyLevel: goal.privacy_level,
      sourceId: null,
      sourceExcerpt: null,
      evidenceRule: "Explicit goal record; a future direction, not a prediction or commitment unless its goal status says so.",
      updatedAt: goal.updated_at,
    }));

  return {
    historical,
    current,
    future,
    unknown: {
      historical: historical.length === 0,
      current: current.length === 0,
      future: future.length === 0,
    },
    principles: {
      readOnly: true,
      noPersonalityScoring: true,
      noLlmTemporalInference: true,
      unknownIsUnknown: true,
      currentIsNotIdentity: true,
      goalIsNotPrediction: true,
    },
  };
}
