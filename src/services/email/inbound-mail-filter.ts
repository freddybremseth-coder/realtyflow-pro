export type InboundMailKind = "customer" | "system" | "bounce" | "newsletter" | "vendor";

const SYSTEM_SENDERS = [
  /(^|@)no-?reply@/i,
  /(^|@)noreply@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /notifications?@/i,
  /posts-recap@/i,
  /@mail\.instagram\.com$/i,
  /@facebookmail\.com$/i,
  /@accounts\.google\.com$/i,
  /@google\.com$/i,
  /@supabase\.com$/i,
  /@mail\.app\.supabase\.io$/i,
  /@email\.openai\.com$/i,
  /@notices\.dropbox\.com$/i,
];

const SYSTEM_SUBJECTS = [
  /undelivered mail/i,
  /delivery status notification/i,
  /mail delivery (?:failed|system)/i,
  /security alert/i,
  /verification code/i,
  /bekreftelseskode/i,
  /innloggingskode/i,
  /billing account/i,
  /expired card/i,
  /credit card is expiring/i,
  /invoice (?:has been|is going to be) paused/i,
  /terms of service/i,
  /retningslinjene for personvern/i,
  /se hva som er nytt på instagram/i,
];

const NEWSLETTER_SENDERS = [
  /@semanal\.idealista\.com$/i,
];

const NEWSLETTER_SUBJECTS = [
  /new properties from/i,
  /property alert/i,
  /newsletter/i,
  /market update/i,
  /supa update/i,
];

const VENDOR_SUBJECTS = [
  /\bcollaboration\b/i,
  /\bpartnership\b/i,
  /\bguest post\b/i,
  /\bseo services?\b/i,
  /\bmarketing services?\b/i,
  /\blead generation\b/i,
  /\binstagram followers?\b/i,
  /\bfurniture (?:solutions?|customization)\b/i,
  /fast-track your villa furniture/i,
  /unified furniture solutions/i,
  /touristic licensed apartments/i,
  /new building in /i,
  /help your customers even after the home purchase/i,
];

export function classifyInboundMailSource(input: { fromAddress?: unknown; subject?: unknown }): InboundMailKind {
  const from = String(input.fromAddress || "").trim().toLowerCase();
  const subject = String(input.subject || "").trim();
  if (/mailer-daemon@|postmaster@/i.test(from) || /undelivered mail|delivery status notification|mail delivery failed/i.test(subject)) return "bounce";
  if (SYSTEM_SENDERS.some((pattern) => pattern.test(from)) || SYSTEM_SUBJECTS.some((pattern) => pattern.test(subject))) return "system";
  if (NEWSLETTER_SENDERS.some((pattern) => pattern.test(from)) || NEWSLETTER_SUBJECTS.some((pattern) => pattern.test(subject))) return "newsletter";
  if (VENDOR_SUBJECTS.some((pattern) => pattern.test(subject))) return "vendor";
  return "customer";
}

export function isCustomerInbound(input: { fromAddress?: unknown; subject?: unknown }) {
  return classifyInboundMailSource(input) === "customer";
}
