export type InboundMailKind = "customer" | "system" | "bounce" | "newsletter" | "vendor";

export type InboundMailClassificationInput = {
  fromAddress?: unknown;
  fromName?: unknown;
  subject?: unknown;
  bodyText?: unknown;
  listId?: unknown;
  listUnsubscribe?: unknown;
  precedence?: unknown;
  autoSubmitted?: unknown;
};

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
  /^(?:newsletter|news|updates?|digest|bulletin|campaign|marketing|offers?|deals?|alerts?)@/i,
  /(?:^|[._+-])(?:newsletter|digest|bulletin|campaign|marketing)(?:[._+-]|@)/i,
  /@(?:newsletter|news)\./i,
];

const NEWSLETTER_SUBJECTS = [
  /new properties from/i,
  /property alert/i,
  /newsletter/i,
  /market update/i,
  /supa update/i,
  /\b(?:daily|weekly|monthly)\s+(?:digest|roundup|update|newsletter)\b/i,
  /\b(?:property|listing|market)\s+(?:digest|newsletter|roundup)\b/i,
  /\blatest (?:news|offers|listings|properties)\b/i,
];

const NEWSLETTER_NAMES = [
  /\bnewsletter\b/i,
  /\bdigest\b/i,
  /\bmarketing\b/i,
  /\bproperty alerts?\b/i,
];

const NEWSLETTER_BODY_MARKERS = [
  /\bunsubscribe\b/i,
  /\bmanage (?:your )?(?:email )?preferences\b/i,
  /\bview (?:this )?(?:email|newsletter) in (?:your )?browser\b/i,
  /\bavmeld\b/i,
  /\bdarse de baja\b/i,
];

function signal(value: unknown) {
  return String(value || "").trim();
}

function looksLikeBulkNewsletter(input: InboundMailClassificationInput) {
  const listId = signal(input.listId);
  const listUnsubscribe = signal(input.listUnsubscribe);
  const precedence = signal(input.precedence);
  if (listId || listUnsubscribe || /^(?:bulk|list|junk)$/i.test(precedence)) return true;

  const name = signal(input.fromName);
  if (NEWSLETTER_NAMES.some((pattern) => pattern.test(name))) return true;

  const body = signal(input.bodyText).slice(-5000);
  const markerCount = NEWSLETTER_BODY_MARKERS.reduce((count, pattern) => count + (pattern.test(body) ? 1 : 0), 0);
  return markerCount >= 2;
}

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

export function classifyInboundMailSource(input: InboundMailClassificationInput): InboundMailKind {
  const from = String(input.fromAddress || "").trim().toLowerCase();
  const subject = String(input.subject || "").trim();
  const autoSubmitted = signal(input.autoSubmitted);
  if (/mailer-daemon@|postmaster@/i.test(from) || /undelivered mail|delivery status notification|mail delivery failed/i.test(subject)) return "bounce";
  if (SYSTEM_SENDERS.some((pattern) => pattern.test(from)) || SYSTEM_SUBJECTS.some((pattern) => pattern.test(subject)) || /^(?:auto-replied|auto-generated)$/i.test(autoSubmitted)) return "system";
  if (NEWSLETTER_SENDERS.some((pattern) => pattern.test(from)) || NEWSLETTER_SUBJECTS.some((pattern) => pattern.test(subject)) || looksLikeBulkNewsletter(input)) return "newsletter";
  if (VENDOR_SUBJECTS.some((pattern) => pattern.test(subject))) return "vendor";
  return "customer";
}

export function isCustomerInbound(input: { fromAddress?: unknown; subject?: unknown }) {
  return classifyInboundMailSource(input) === "customer";
}
