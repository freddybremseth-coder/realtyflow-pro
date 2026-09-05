export type EvidenceConfidenceInput = {
  sourceStrength: number;
  fieldCoverage: number;
  specificity: number;
};

export type EvidenceConfidence = EvidenceConfidenceInput & {
  score: number;
  label: "HIGH" | "MEDIUM" | "LOW";
};

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function scoreEvidenceConfidence(input: EvidenceConfidenceInput): EvidenceConfidence {
  const sourceStrength = clamp(input.sourceStrength);
  const fieldCoverage = clamp(input.fieldCoverage);
  const specificity = clamp(input.specificity);
  const score = Math.round(sourceStrength * 0.4 + fieldCoverage * 0.4 + specificity * 0.2);
  const label = score >= 80 ? "HIGH" : score >= 60 ? "MEDIUM" : "LOW";
  return { sourceStrength, fieldCoverage, specificity, score, label };
}

export function revenuePriorityConfidence(input: {
  score?: number | null;
  value?: number | null;
  stage?: string | null;
  nextFollowupAt?: string | null;
  isOverdue?: boolean | null;
}) {
  const fields = [
    Number.isFinite(Number(input.score)) && Number(input.score) > 0,
    Number(input.value || 0) > 0,
    Boolean(String(input.stage || "").trim()),
    Boolean(input.nextFollowupAt) || Boolean(input.isOverdue),
  ];
  const fieldCoverage = Math.round((fields.filter(Boolean).length / fields.length) * 100);
  const specificity = Number(input.value || 0) > 0 && Boolean(input.stage) ? 95 : fieldCoverage >= 75 ? 80 : 55;
  return scoreEvidenceConfidence({ sourceStrength: 100, fieldCoverage, specificity });
}

export function revenueWorkConfidence(input: {
  priority?: string | null;
  dueAt?: string | null;
  aiScore?: number | null;
  sourceType?: string | null;
}) {
  const fields = [
    Boolean(String(input.priority || "").trim()),
    Boolean(input.dueAt),
    Number(input.aiScore || 0) > 0,
    Boolean(String(input.sourceType || "").trim()),
  ];
  const fieldCoverage = Math.round((fields.filter(Boolean).length / fields.length) * 100);
  const specificity = Boolean(input.dueAt) && Number(input.aiScore || 0) > 0 ? 90 : fieldCoverage >= 75 ? 75 : 50;
  return scoreEvidenceConfidence({ sourceStrength: 95, fieldCoverage, specificity });
}

export function confidenceFromSignal(options: {
  sourceStrength: number;
  evidenceCount: number;
  hasExplicitDeadline?: boolean;
  hasCanonicalScore?: boolean;
}) {
  const fieldCoverage = Math.min(100, options.evidenceCount * 25 + (options.hasExplicitDeadline ? 15 : 0) + (options.hasCanonicalScore ? 20 : 0));
  const specificity = options.hasExplicitDeadline || options.hasCanonicalScore ? 80 : options.evidenceCount >= 2 ? 65 : 45;
  return scoreEvidenceConfidence({ sourceStrength: options.sourceStrength, fieldCoverage, specificity });
}
