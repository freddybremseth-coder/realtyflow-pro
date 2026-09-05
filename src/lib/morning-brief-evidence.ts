export type RevenuePriorityEvidence = {
  score?: number | null;
  value?: number | null;
  kind?: string | null;
  stage?: string | null;
  isOverdue?: boolean | null;
  nextFollowupAt?: string | null;
};

export type RevenueWorkEvidence = {
  priority?: string | null;
  dueAt?: string | null;
  aiScore?: number | null;
  sourceType?: string | null;
};

export type EvidenceDimensions = {
  urgency: number;
  impact: number;
  deadlineOrIrreversibility: number;
  ownerRequired: number;
  evidence: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function deadlineScore(dueAt?: string | null, overdue = false, now = new Date()) {
  if (overdue) return 100;
  if (!dueAt) return 45;
  const timestamp = Date.parse(dueAt);
  if (!Number.isFinite(timestamp)) return 45;
  const hours = (timestamp - now.getTime()) / 3_600_000;
  if (hours <= 0) return 100;
  if (hours <= 24) return 92;
  if (hours <= 72) return 80;
  if (hours <= 168) return 65;
  return 45;
}

function valueImpact(value: number) {
  if (value >= 750_000) return 100;
  if (value >= 500_000) return 92;
  if (value >= 250_000) return 82;
  if (value >= 100_000) return 72;
  if (value > 0) return 62;
  return 55;
}

export function revenuePriorityEvidenceDimensions(item: RevenuePriorityEvidence, now = new Date()): EvidenceDimensions {
  const score = clamp(Number(item.score || 0));
  const value = Math.max(0, Number(item.value || 0));
  const kind = String(item.kind || "").toLowerCase();
  const stage = String(item.stage || "").toUpperCase();
  const closing = kind === "closing" || stage === "VIEWING" || stage === "NEGOTIATION";
  const impact = Math.max(valueImpact(value), closing ? 88 : 0);
  const ownerRequired = closing ? 95 : stage === "QUALIFIED" ? 82 : 72;
  const evidence = [
    `revenue score ${Math.round(score)}/100`,
    value > 0 ? `pipeline value ${Math.round(value)}` : "pipeline value not set",
    stage ? `stage ${stage}` : null,
    item.isOverdue ? "follow-up overdue" : null,
    item.nextFollowupAt ? `next follow-up ${item.nextFollowupAt}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    urgency: Math.max(45, score),
    impact,
    deadlineOrIrreversibility: deadlineScore(item.nextFollowupAt, Boolean(item.isOverdue), now),
    ownerRequired,
    evidence,
  };
}

export function revenueWorkEvidenceDimensions(item: RevenueWorkEvidence, now = new Date()): EvidenceDimensions {
  const priority = String(item.priority || "MEDIUM").toUpperCase();
  const priorityUrgency = priority === "CRITICAL" ? 100 : priority === "HIGH" ? 88 : priority === "MEDIUM" ? 68 : 50;
  const aiScore = clamp(Number(item.aiScore || 0));
  const sourceType = String(item.sourceType || "manual").toLowerCase();
  const ownerRequired = ["crm", "website_lead", "chatbot", "lead_intelligence"].includes(sourceType) ? 78 : 55;
  const evidence = [
    `work priority ${priority}`,
    aiScore > 0 ? `AI score ${Math.round(aiScore)}/100` : null,
    item.dueAt ? `due ${item.dueAt}` : null,
    `source ${sourceType}`,
  ].filter((value): value is string => Boolean(value));

  return {
    urgency: Math.max(priorityUrgency, aiScore),
    impact: Math.max(55, aiScore),
    deadlineOrIrreversibility: deadlineScore(item.dueAt, false, now),
    ownerRequired,
    evidence,
  };
}
