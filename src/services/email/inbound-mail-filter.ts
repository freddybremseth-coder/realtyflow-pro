export type InboundMailKind = "customer" | "system" | "bounce" | "newsletter";

const SYSTEM_SENDERS = [
  /(^|@)no-?reply@/i,
  /(^|@)noreply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /notifications?@/i,
  /posts-recap@/i,
  /@mail\.instagram\.com$/i,
  /@facebookmail\.com$/i,
  /accounts\.google\.com$/i,
  /google\.com$/i,
];

const SYSTEM_SUBJECTS = [
  /undelivered mail/i,
  /delivery status notification/i,
  /mail delivery (?:failed|system)/i,
  /security alert/i,
  /verification code/i,
  /bekreftelseskode/i,
  /billing account/i,
  /expired card/i,
  /se hva som er nytt på instagram/i,
];

const NEWSLETTER_SUBJECTS = [
  /new properties from/i,
  /property alert/i,
  /newsletter/i,
  /market update/i,
];

export function classifyInboundMailSource(input: { fromAddress?: unknown; subject?: unknown }): InboundMailKind {
  const from = String(input.fromAddress || "").trim().toLowerCase();
  const subject = String(input.subject || "").trim();
  if (/mailer-daemon@|postmaster@/i.test(from) || /undelivered mail|delivery status notification|mail delivery failed/i.test(subject)) return "bounce";
  if (SYSTEM_SENDERS.some((pattern) => pattern.test(from)) || SYSTEM_SUBJECTS.some((pattern) => pattern.test(subject))) return "system";
  if (NEWSLETTER_SUBJECTS.some((pattern) => pattern.test(subject))) return "newsletter";
  return "customer";
}

export function isCustomerInbound(input: { fromAddress?: unknown; subject?: unknown }) {
  return classifyInboundMailSource(input) === "customer";
}
