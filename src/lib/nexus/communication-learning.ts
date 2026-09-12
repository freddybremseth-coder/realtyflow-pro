export type CommunicationLearningEvidence = "insufficient" | "limited" | "moderate" | "strong";
export type CommunicationLearningVerdict = "observe" | "promising" | "prefer" | "avoid";

export interface CommunicationLearningRuleMetrics {
  sent: number;
  replies: number;
  editSum: number;
  baselineSent: number;
  baselineReplies: number;
}

export function communicationEvidence(sample: number): CommunicationLearningEvidence {
  if (sample >= 25) return "strong";
  if (sample >= 10) return "moderate";
  if (sample >= 5) return "limited";
  return "insufficient";
}

export function messageLengthBucket(body: unknown) {
  const length = String(body || "").trim().length;
  if (length <= 280) return "short";
  if (length <= 900) return "medium";
  return "long";
}

export function sendHourBucket(sentAt: unknown) {
  const date = new Date(String(sentAt || ""));
  if (Number.isNaN(date.getTime())) return "unknown";
  const hour = date.getUTCHours();
  if (hour < 6) return "00-05";
  if (hour < 10) return "06-09";
  if (hour < 14) return "10-13";
  if (hour < 18) return "14-17";
  if (hour < 22) return "18-21";
  return "22-23";
}

export function sendWeekday(sentAt: unknown) {
  const date = new Date(String(sentAt || ""));
  if (Number.isNaN(date.getTime())) return "unknown";
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()];
}

export function deriveCommunicationLearningDimensions(input: {
  sentAt?: unknown;
  bodyText?: unknown;
  tone?: unknown;
  language?: unknown;
  intent?: unknown;
}) {
  return [
    ["tone", String(input.tone || "unknown")],
    ["language", String(input.language || "unknown")],
    ["intent", String(input.intent || "unknown")],
    ["send_hour_utc", sendHourBucket(input.sentAt)],
    ["weekday_utc", sendWeekday(input.sentAt)],
    ["message_length", messageLengthBucket(input.bodyText)],
  ] as Array<[string, string]>;
}

export function evaluateCommunicationRule(metrics: CommunicationLearningRuleMetrics) {
  const sent = Math.max(0, metrics.sent || 0);
  const replies = Math.max(0, metrics.replies || 0);
  const baselineSent = Math.max(0, metrics.baselineSent || 0);
  const baselineReplies = Math.max(0, metrics.baselineReplies || 0);
  const replyRate = sent ? replies / sent : 0;
  const baselineReplyRate = baselineSent ? baselineReplies / baselineSent : 0;
  const avgEditRatio = sent ? Math.max(0, metrics.editSum || 0) / sent : 0;
  const evidence = communicationEvidence(sent);
  let verdict: CommunicationLearningVerdict = "observe";

  if (evidence === "moderate" || evidence === "strong") {
    if (replyRate >= baselineReplyRate + 0.10 && avgEditRatio <= 0.25) verdict = "prefer";
    else if (replyRate <= Math.max(0, baselineReplyRate - 0.10) && avgEditRatio >= 0.35) verdict = "avoid";
    else if (replyRate > baselineReplyRate && avgEditRatio < 0.30) verdict = "promising";
  }

  return { replyRate, baselineReplyRate, avgEditRatio, evidence, verdict };
}

export const COMMUNICATION_LEARNING_SAFETY = {
  observationalOnly: true,
  automaticSendAllowed: false,
  policyMutationAllowed: false,
  autonomyExpansionAllowed: false,
  maxTimingAuthority: "recommendation_only" as const,
};
