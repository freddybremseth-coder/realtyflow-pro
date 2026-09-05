export type DataGap = {
  field: string;
  message: string;
};

export function revenuePriorityDataGaps(input: {
  value?: number | null;
  stage?: string | null;
  nextFollowupAt?: string | null;
  score?: number | null;
}) {
  const gaps: DataGap[] = [];
  if (!(Number(input.value || 0) > 0)) gaps.push({ field: "pipeline_value", message: "Pipeline value is missing." });
  if (!String(input.stage || "").trim()) gaps.push({ field: "stage", message: "Pipeline stage is missing." });
  if (!input.nextFollowupAt) gaps.push({ field: "next_followup", message: "Next follow-up is missing." });
  if (!(Number(input.score || 0) > 0)) gaps.push({ field: "revenue_score", message: "Revenue score is missing or zero." });
  return gaps;
}

export function revenueWorkDataGaps(input: {
  priority?: string | null;
  dueAt?: string | null;
  aiScore?: number | null;
  sourceType?: string | null;
}) {
  const gaps: DataGap[] = [];
  if (!String(input.priority || "").trim()) gaps.push({ field: "priority", message: "Work priority is missing." });
  if (!input.dueAt) gaps.push({ field: "due_date", message: "Due date is missing." });
  if (!(Number(input.aiScore || 0) > 0)) gaps.push({ field: "ai_score", message: "AI score is missing or zero." });
  if (!String(input.sourceType || "").trim()) gaps.push({ field: "source_type", message: "Source type is missing." });
  return gaps;
}

export function genericSignalDataGaps(options: {
  hasExplicitDeadline?: boolean;
  hasCanonicalScore?: boolean;
  evidenceCount: number;
}) {
  const gaps: DataGap[] = [];
  if (!options.hasExplicitDeadline) gaps.push({ field: "deadline", message: "No explicit deadline is available." });
  if (!options.hasCanonicalScore) gaps.push({ field: "canonical_score", message: "No canonical score is available." });
  if (options.evidenceCount < 2) gaps.push({ field: "evidence", message: "The recommendation has limited supporting evidence." });
  return gaps;
}

export function dataGapSummary(gaps: DataGap[], confidenceScore: number) {
  if (confidenceScore >= 80 || gaps.length === 0) return null;
  return `Confidence can improve by adding: ${gaps.slice(0, 3).map((gap) => gap.message.replace(/\.$/, "")).join(" · ")}.`;
}
