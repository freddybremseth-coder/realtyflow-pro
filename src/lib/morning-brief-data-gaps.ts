export type DataGapResolution = "AUTO_DISCOVERABLE" | "HUMAN_REQUIRED";

export type DataGap = {
  field: string;
  message: string;
  resolution: DataGapResolution;
  rationale: string;
};

const HUMAN_REQUIRED_FIELDS = new Set([
  "pipeline_value",
  "stage",
  "next_followup",
  "priority",
  "due_date",
  "deadline",
]);

function gap(field: string, message: string): DataGap {
  const humanRequired = HUMAN_REQUIRED_FIELDS.has(field);
  return {
    field,
    message,
    resolution: humanRequired ? "HUMAN_REQUIRED" : "AUTO_DISCOVERABLE",
    rationale: humanRequired
      ? "This value represents intent, commitment, timing, or business judgment and should not be inferred silently."
      : "Nexus may be able to discover this from existing canonical system evidence without asking the owner first.",
  };
}

export function revenuePriorityDataGaps(input: {
  value?: number | null;
  stage?: string | null;
  nextFollowupAt?: string | null;
  score?: number | null;
}) {
  const gaps: DataGap[] = [];
  if (!(Number(input.value || 0) > 0)) gaps.push(gap("pipeline_value", "Pipeline value is missing."));
  if (!String(input.stage || "").trim()) gaps.push(gap("stage", "Pipeline stage is missing."));
  if (!input.nextFollowupAt) gaps.push(gap("next_followup", "Next follow-up is missing."));
  if (!(Number(input.score || 0) > 0)) gaps.push(gap("revenue_score", "Revenue score is missing or zero."));
  return gaps;
}

export function revenueWorkDataGaps(input: {
  priority?: string | null;
  dueAt?: string | null;
  aiScore?: number | null;
  sourceType?: string | null;
}) {
  const gaps: DataGap[] = [];
  if (!String(input.priority || "").trim()) gaps.push(gap("priority", "Work priority is missing."));
  if (!input.dueAt) gaps.push(gap("due_date", "Due date is missing."));
  if (!(Number(input.aiScore || 0) > 0)) gaps.push(gap("ai_score", "AI score is missing or zero."));
  if (!String(input.sourceType || "").trim()) gaps.push(gap("source_type", "Source type is missing."));
  return gaps;
}

export function genericSignalDataGaps(options: {
  hasExplicitDeadline?: boolean;
  hasCanonicalScore?: boolean;
  evidenceCount: number;
}) {
  const gaps: DataGap[] = [];
  if (!options.hasExplicitDeadline) gaps.push(gap("deadline", "No explicit deadline is available."));
  if (!options.hasCanonicalScore) gaps.push(gap("canonical_score", "No canonical score is available."));
  if (options.evidenceCount < 2) gaps.push(gap("evidence", "The recommendation has limited supporting evidence."));
  return gaps;
}

export function partitionDataGaps(gaps: DataGap[]) {
  return {
    autoDiscoverable: gaps.filter((gap) => gap.resolution === "AUTO_DISCOVERABLE"),
    humanRequired: gaps.filter((gap) => gap.resolution === "HUMAN_REQUIRED"),
  };
}

function compactMessages(gaps: DataGap[]) {
  return gaps.slice(0, 3).map((gap) => gap.message.replace(/\.$/, "")).join(" · ");
}

export function dataGapSummary(gaps: DataGap[], confidenceScore: number) {
  if (confidenceScore >= 80 || gaps.length === 0) return null;

  const { autoDiscoverable, humanRequired } = partitionDataGaps(gaps);
  const parts: string[] = [];
  if (autoDiscoverable.length > 0) {
    parts.push(`System can investigate: ${compactMessages(autoDiscoverable)}.`);
  }
  if (humanRequired.length > 0) {
    parts.push(`Needs your input: ${compactMessages(humanRequired)}.`);
  }
  return parts.join(" ");
}
