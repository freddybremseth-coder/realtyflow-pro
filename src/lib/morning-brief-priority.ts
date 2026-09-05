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
