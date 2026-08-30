import { classifyEmailIdentityReviewPriority, type EmailIdentityReviewAssessment, type EmailLinkAssessment } from "./email-link-health";

const ACTIONABLE_INTENTS = new Set(["inquiry", "follow_up"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function occurredAt(assessment: EmailLinkAssessment) {
  return assessment.message.received_at || assessment.message.created_at || null;
}

function ageDays(value: string | null, now: Date) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

export function classifyEmailIdentityReviewPriorityWithAge(
  assessment: EmailLinkAssessment,
  now = new Date(),
): EmailIdentityReviewAssessment {
  const base = classifyEmailIdentityReviewPriority(assessment);

  if (assessment.state !== "unlinked") return base;

  const direction = String(assessment.message.direction || "").trim().toLowerCase();
  const intent = String(assessment.message.ai_intent || "").trim().toLowerCase();
  if (direction !== "inbound" || !ACTIONABLE_INTENTS.has(intent)) return base;

  const days = ageDays(occurredAt(assessment), now);
  if (days === null || days <= 30) return base;

  if (days <= 90) {
    return {
      priority: "medium",
      reason: `Inbound ${intent} uten sikker CRM-identitet er ${days} dager gammel. AI-intent er kun prioriteringssignal; eldre intent-only review degraderes til medium.`,
    };
  }

  return {
    priority: "low",
    reason: `Inbound ${intent} uten sikker CRM-identitet er ${days} dager gammel. AI-intent er kun prioriteringssignal; historisk intent-only review over 90 dager degraderes til lav.`,
  };
}
