import type { SocialAutopilotRow } from "@/lib/social-autopilot";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

export type NexusInboxSource = "system" | "approval" | "marketing" | "email_identity" | "buyer_criteria" | "shortlist_review" | "no_match" | "viewing_coach";
export type NexusInboxPriority = "critical" | "high" | "medium" | "low";

export interface NexusInboxItem {
  id: string;
  source: NexusInboxSource;
  priority: NexusInboxPriority;
  title: string;
  reason: string;
  href: string;
  actionLabel: string;
  customerName?: string | null;
  blocked?: boolean;
  occurredAt?: string | null;
}

type OsAttentionItem = {
  id: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
};

type ApprovalItem = {
  id: string;
  title: string;
  summary: string | null;
  ready: boolean;
  blocker: string | null;
  ageDays: number;
  customerName: string;
  reviewHref: string;
};

type EmailIdentityReviewItem = {
  id: string;
  subject: string;
  priority: "high" | "medium" | "low";
  reason: string;
  state: "linked" | "exact_candidate" | "ambiguous" | "unlinked";
  domain?: string | null;
  occurredAt?: string | null;
};

type BuyerCriteriaReviewItem = {
  id: string;
  priority?: string | null;
  customerName?: string | null;
  replyPreview?: string | null;
  nextAction?: string | null;
  reviewHref: string;
  updatedAt?: string | null;
};

type ShortlistReviewItem = {
  id: string;
  priority?: string | null;
  customerName?: string | null;
  candidateCount?: number | null;
  nextAction?: string | null;
  reviewHref: string;
  updatedAt?: string | null;
};

type NoMatchReviewItem = {
  id: string;
  priority?: string | null;
  customerName?: string | null;
  analyzed?: number | null;
  criteria?: string[] | null;
  question?: string | null;
  constraintFocus?: string | null;
  draft?: { subject?: string | null; bodyText?: string | null } | null;
  nextAction?: string | null;
  reviewHref: string;
  updatedAt?: string | null;
};

type ViewingCoachReviewItem = {
  id: string;
  priority?: string | null;
  customerName?: string | null;
  sentiment?: string | null;
  reasons?: string[] | null;
  explicitCriteria?: string[] | null;
  highIntent?: boolean | null;
  shouldRematch?: boolean | null;
  note?: string | null;
  property?: { id?: string | null; reference?: string | null; title?: string | null; location?: string | null } | null;
  nextAction?: string | null;
  reviewHref: string;
  updatedAt?: string | null;
};

const PRIORITY_WEIGHT: Record<NexusInboxPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function osPriority(severity: OsAttentionItem["severity"]): NexusInboxPriority {
  if (severity === "high") return "critical";
  if (severity === "medium") return "high";
  return "medium";
}

function timestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function noMatchConstraintLabel(value: string | null | undefined) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "location") return "område";
  if (key === "budget") return "budsjett";
  if (key === "property_type") return "boligtype";
  if (key === "bedrooms") return "soverom";
  if (key === "market_fit") return "markedsfit";
  return null;
}

function viewingSentimentLabel(value: string | null | undefined) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "positive") return "positiv";
  if (key === "negative") return "negativ";
  if (key === "mixed") return "blandet";
  return "uklar";
}

function viewingReasonLabel(value: string) {
  const key = String(value || "").trim().toLowerCase();
  if (key === "price_high") return "pris oppleves høy";
  if (key === "price_good") return "pris oppleves god";
  if (key === "location_dislike") return "området passer dårligere";
  if (key === "location_like") return "området passer godt";
  if (key === "too_small") return "for liten";
  if (key === "too_large") return "for stor";
  if (key === "style_dislike") return "stil passer dårligere";
  if (key === "style_like") return "stil passer godt";
  return key.replaceAll("_", " ");
}

export function buildNexusInbox(input: {
  attention: OsAttentionItem[];
  approvals: ApprovalItem[];
  marketingRows: SocialAutopilotRow[];
  emailIdentityReviews?: EmailIdentityReviewItem[];
  buyerCriteriaReviews?: BuyerCriteriaReviewItem[];
  shortlistReviews?: ShortlistReviewItem[];
  noMatchReviews?: NoMatchReviewItem[];
  viewingCoachReviews?: ViewingCoachReviewItem[];
}): NexusInboxItem[] {
  const items: NexusInboxItem[] = [];

  for (const row of input.attention.filter((item) => item.id !== "os:clear")) {
    items.push({
      id: `system:${row.id}`,
      source: "system",
      priority: osPriority(row.severity),
      title: row.title,
      reason: row.detail,
      href: row.href,
      actionLabel: "Åpne",
    });
  }

  for (const row of input.approvals) {
    items.push({
      id: `approval:${row.id}`,
      source: "approval",
      priority: row.ready ? (row.ageDays >= 3 ? "critical" : "high") : "medium",
      title: row.title,
      reason: row.ready ? (row.summary || "Klar for menneskelig gjennomgang.") : (row.blocker || "Venter på et tidligere godkjenningssteg."),
      href: row.reviewHref,
      actionLabel: row.ready ? "Gjennomgå" : "Se blokkering",
      customerName: row.customerName,
      blocked: !row.ready,
    });
  }

  const marketing = summarizeSocialAutopilot(input.marketingRows);
  for (const row of marketing.blockers) {
    items.push({
      id: `marketing:blocker:${row.brandId}:${row.platform ?? "none"}`,
      source: "marketing",
      priority: "high",
      title: `${row.brandName} · ${row.platform ?? "kanal"}`,
      reason: row.pilotBlockReason || "Kanalen er tilkoblet, men ikke klar for pilot.",
      href: "/social-automation?view=attention",
      actionLabel: "Se marketing",
    });
  }
  if (marketing.quarantined > 0) {
    items.push({
      id: "marketing:quarantine",
      source: "marketing",
      priority: "high",
      title: `${marketing.quarantined} publiseringsobjekt i quarantine`,
      reason: "Innhold eller publisering trenger menneskelig kontroll før videre flyt.",
      href: "/social-automation?view=attention",
      actionLabel: "Gjennomgå",
    });
  }

  for (const row of input.emailIdentityReviews ?? []) {
    if (row.priority !== "high") continue;
    items.push({
      id: `email-identity:${row.id}`,
      source: "email_identity",
      priority: row.state === "ambiguous" ? "critical" : "high",
      title: row.subject || "E-postidentitet trenger review",
      reason: `${row.reason}${row.domain ? ` · ${row.domain}` : ""}`,
      href: `/nexus-os/email-link-health?messageId=${encodeURIComponent(row.id)}`,
      actionLabel: "Review identitet",
      occurredAt: row.occurredAt ?? null,
    });
  }

  for (const row of input.buyerCriteriaReviews ?? []) {
    const preview = String(row.replyPreview || "").trim();
    const nextAction = String(row.nextAction || "Tolk kundens svar og legg inn korrekte søkekriterier før matching fortsetter.").trim();
    items.push({
      id: `buyer-criteria:${row.id}`,
      source: "buyer_criteria",
      priority: String(row.priority || "HIGH").toUpperCase() === "CRITICAL" ? "critical" : "high",
      title: "Kundesvar trenger din tolkning",
      reason: preview ? `Kunden svarte: «${preview}» · ${nextAction}` : nextAction,
      href: row.reviewHref,
      actionLabel: "Tolk svar",
      customerName: row.customerName ?? null,
      occurredAt: row.updatedAt ?? null,
    });
  }

  for (const row of input.shortlistReviews ?? []) {
    const candidateCount = Math.max(0, Number(row.candidateCount || 0));
    const nextAction = String(row.nextAction || "Kontroller kandidatene og marker hvilke boliger som er klare for kunden.").trim();
    items.push({
      id: `shortlist-review:${row.id}`,
      source: "shortlist_review",
      priority: String(row.priority || "HIGH").toUpperCase() === "CRITICAL" ? "critical" : "high",
      title: "Boligforslag trenger kvalitetssjekk",
      reason: candidateCount > 0
        ? `Nexus har klargjort ${candidateCount} boligkandidat${candidateCount === 1 ? "" : "er"}. ${nextAction}`
        : nextAction,
      href: row.reviewHref,
      actionLabel: "Review boliger",
      customerName: row.customerName ?? null,
      occurredAt: row.updatedAt ?? null,
    });
  }

  for (const row of input.viewingCoachReviews ?? []) {
    const property = row.property || {};
    const propertyLabel = String(property.reference || property.title || "").trim();
    const location = String(property.location || "").trim();
    const sentiment = viewingSentimentLabel(row.sentiment);
    const reasons = Array.isArray(row.reasons) ? row.reasons.filter(Boolean).slice(0, 4).map(viewingReasonLabel) : [];
    const evidence = reasons.length ? ` Signal: ${reasons.join(" · ")}.` : "";
    const context = propertyLabel || location
      ? ` ${propertyLabel ? `Bolig: ${propertyLabel}.` : ""}${location ? ` Område: ${location}.` : ""}`
      : "";
    const note = String(row.note || "").trim();
    const notePreview = note ? ` Feedback: «${note.slice(0, 220)}${note.length > 220 ? "…" : ""}»` : "";
    const nextAction = String(row.nextAction || "Gjennomgå visningsfeedback og velg neste steg.").trim();
    const criteriaReview = Array.isArray(row.explicitCriteria) && row.explicitCriteria.length > 0;
    items.push({
      id: `viewing-coach:${row.id}`,
      source: "viewing_coach",
      priority: row.highIntent ? "critical" : String(row.priority || "MEDIUM").toUpperCase() === "HIGH" ? "high" : "medium",
      title: row.highIntent ? "HOT LEAD etter visning – Nexus Coach" : "Visningsfeedback – Nexus Coach",
      reason: `Bekreftet visning med ${sentiment} feedback.${context}${evidence}${notePreview} ${nextAction}`.trim(),
      href: row.reviewHref,
      actionLabel: row.highIntent ? "Review neste steg" : criteriaReview ? "Review Buyer Profile" : row.shouldRematch ? "Review reranking" : "Review visning",
      customerName: row.customerName ?? null,
      occurredAt: row.updatedAt ?? null,
    });
  }

  for (const row of input.noMatchReviews ?? []) {
    const analyzed = Math.max(0, Number(row.analyzed || 0));
    const criteria = Array.isArray(row.criteria) ? row.criteria.filter(Boolean).slice(0, 4) : [];
    const context = criteria.length ? ` Registrert: ${criteria.join(" · ")}.` : "";
    const question = String(row.question || "").trim();
    const constraint = noMatchConstraintLabel(row.constraintFocus);
    const coach = question
      ? ` Nexus vurderer ${constraint ? `${constraint} som mulig flaskehals og ` : ""}foreslår ett spørsmål: «${question}»`
      : "";
    const nextAction = String(row.nextAction || "Gjennomgå Nexus sitt ene avklaringsspørsmål før eventuell kundekontakt.").trim();
    items.push({
      id: `no-match:${row.id}`,
      source: "no_match",
      priority: String(row.priority || "HIGH").toUpperCase() === "CRITICAL" ? "critical" : "high",
      title: "Ingen gode boligtreff – Nexus Coach",
      reason: `${analyzed > 0 ? `Nexus analyserte ${analyzed} boliger uten å finne et godt nok treff.` : "Nexus fant ingen gode nok boligtreff."}${context}${coach} ${nextAction}`.trim(),
      href: row.reviewHref,
      actionLabel: question ? "Review spørsmål" : "Vurder søk",
      customerName: row.customerName ?? null,
      occurredAt: row.updatedAt ?? null,
    });
  }

  return items.sort((a, b) => {
    const priorityDifference = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDifference) return priorityDifference;
    if (a.source === b.source && ["email_identity", "buyer_criteria", "shortlist_review", "no_match", "viewing_coach"].includes(a.source)) {
      const recencyDifference = timestamp(b.occurredAt) - timestamp(a.occurredAt);
      if (recencyDifference) return recencyDifference;
    }
    return a.title.localeCompare(b.title, "nb");
  });
}

export function summarizeNexusInbox(items: NexusInboxItem[]) {
  return {
    total: items.length,
    critical: items.filter((item) => item.priority === "critical").length,
    approvals: items.filter((item) => item.source === "approval").length,
    marketing: items.filter((item) => item.source === "marketing").length,
    emailIdentity: items.filter((item) => item.source === "email_identity").length,
    buyerCriteria: items.filter((item) => item.source === "buyer_criteria").length,
    shortlistReview: items.filter((item) => item.source === "shortlist_review").length,
    noMatch: items.filter((item) => item.source === "no_match").length,
    viewingCoach: items.filter((item) => item.source === "viewing_coach").length,
    system: items.filter((item) => item.source === "system").length,
  };
}
