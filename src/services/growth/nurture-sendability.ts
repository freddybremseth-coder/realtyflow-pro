export type NurtureSendabilityReason =
  | "SENDABLE"
  | "MISSING_EMAIL"
  | "INVALID_EMAIL"
  | "MULTIPLE_EMAILS"
  | "DUPLICATE_EMAIL"
  | "DO_NOT_CONTACT"
  | "EMAIL_SUPPRESSED"
  | "TERMINAL_PIPELINE"
  | "UNRESOLVED_INBOUND_REPLY";

export type NurtureSendabilityInput = {
  email?: string | null;
  normalizedEmailCount?: number;
  doNotContact?: boolean | null;
  emailSuppressed?: boolean | null;
  pipelineStatus?: string | null;
  lastInboundReplyAt?: string | null;
  lastRealSendAt?: string | null;
};

export type NurtureSendabilityDecision = {
  sendable: boolean;
  normalizedEmail: string | null;
  reason: NurtureSendabilityReason;
  requiresReview: boolean;
};

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMINAL_PIPELINE = new Set(["WON", "LOST"]);

export function normalizeNurtureEmail(value?: string | null): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function validTimestamp(value?: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export function evaluateNurtureSendability(
  input: NurtureSendabilityInput,
): NurtureSendabilityDecision {
  const normalizedEmail = normalizeNurtureEmail(input.email);
  if (!normalizedEmail) {
    return { sendable: false, normalizedEmail: null, reason: "MISSING_EMAIL", requiresReview: true };
  }

  // A single CRM field must contain exactly one mailbox. Commas/semicolons are
  // deliberately rejected so nurture can never spray to an unreviewed list.
  if (/[;,]/.test(normalizedEmail)) {
    return { sendable: false, normalizedEmail, reason: "MULTIPLE_EMAILS", requiresReview: true };
  }
  if (!SIMPLE_EMAIL.test(normalizedEmail)) {
    return { sendable: false, normalizedEmail, reason: "INVALID_EMAIL", requiresReview: true };
  }

  if (input.doNotContact) {
    return { sendable: false, normalizedEmail, reason: "DO_NOT_CONTACT", requiresReview: false };
  }
  if (input.emailSuppressed) {
    return { sendable: false, normalizedEmail, reason: "EMAIL_SUPPRESSED", requiresReview: false };
  }

  const pipeline = String(input.pipelineStatus || "").trim().toUpperCase();
  if (TERMINAL_PIPELINE.has(pipeline)) {
    return { sendable: false, normalizedEmail, reason: "TERMINAL_PIPELINE", requiresReview: false };
  }

  if ((input.normalizedEmailCount ?? 1) > 1) {
    return { sendable: false, normalizedEmail, reason: "DUPLICATE_EMAIL", requiresReview: true };
  }

  const inboundAt = validTimestamp(input.lastInboundReplyAt);
  const sentAt = validTimestamp(input.lastRealSendAt);
  if (inboundAt !== null && (sentAt === null || inboundAt > sentAt)) {
    return {
      sendable: false,
      normalizedEmail,
      reason: "UNRESOLVED_INBOUND_REPLY",
      requiresReview: true,
    };
  }

  return { sendable: true, normalizedEmail, reason: "SENDABLE", requiresReview: false };
}
