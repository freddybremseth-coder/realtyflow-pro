export type MorningBriefPriorityInput = {
  id: string;
  urgency: number;
  impact: number;
  deadlineOrIrreversibility: number;
  ownerRequired: number;
};

export type MorningBriefPriorityScore = MorningBriefPriorityInput & {
  score: number;
};

const WEIGHTS = {
  urgency: 0.35,
  impact: 0.30,
  deadlineOrIrreversibility: 0.20,
  ownerRequired: 0.15,
} as const;

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function scoreMorningBriefPriority(input: MorningBriefPriorityInput): MorningBriefPriorityScore {
  const urgency = clamp(input.urgency);
  const impact = clamp(input.impact);
  const deadlineOrIrreversibility = clamp(input.deadlineOrIrreversibility);
  const ownerRequired = clamp(input.ownerRequired);
  const score = Math.round(
    urgency * WEIGHTS.urgency
      + impact * WEIGHTS.impact
      + deadlineOrIrreversibility * WEIGHTS.deadlineOrIrreversibility
      + ownerRequired * WEIGHTS.ownerRequired,
  );

  return { ...input, urgency, impact, deadlineOrIrreversibility, ownerRequired, score };
}

export function rankMorningBriefPriorities<T extends MorningBriefPriorityInput>(items: T[]) {
  return items
    .map((item) => ({ item, priority: scoreMorningBriefPriority(item) }))
    .sort((a, b) => b.priority.score - a.priority.score || a.item.id.localeCompare(b.item.id));
}

export const MORNING_BRIEF_PRIORITY_WEIGHTS = WEIGHTS;


/**
 * Very old personal due dates are stale signals, not ever-growing urgency.
 * The source remains visible, but needs verification before a new deadline is implied.
 */
export function personalDeadlineScore(dueAt?: string | null, now = new Date()): number {
  if (!dueAt) return 45;
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return 45;
  const hours = (due - now.getTime()) / 3_600_000;
  if (hours < -24 * 14) return 45;
  if (hours < -24 * 7) return 65;
  if (hours <= 0) return 95;
  if (hours <= 24) return 90;
  if (hours <= 72) return 75;
  if (hours <= 168) return 60;
  return 40;
}

/** A high-severity system signal is not evidence of an actual deadline. */
export function operationalPriorityEvidence(input: {
  severity: "high" | "medium" | "low";
  score: number;
  responsibility?: "USER" | "SYSTEM" | "WATCH";
}) {
  const urgency = input.severity === "high" ? 95 : input.severity === "medium" ? 75 : 55;
  return {
    urgency,
    impact: clamp(input.score || 60),
    // No due date or irreversible transition is supplied by this source.
    deadlineOrIrreversibility: 40,
    // Respect explicit responsibility rather than assuming all high-severity
    // configuration checks must be handled by the owner immediately.
    ownerRequired: input.responsibility === "USER" ? 75 : input.responsibility === "SYSTEM" ? 20 : 30,
  };
}

export function isStalePersonalDeadline(dueAt?: string | null, now = new Date()): boolean {
  if (!dueAt) return false;
  const timestamp = Date.parse(dueAt);
  return Number.isFinite(timestamp) && timestamp < now.getTime() - 14 * 24 * 60 * 60 * 1000;
}
