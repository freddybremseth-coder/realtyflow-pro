import type { SocialAutopilotRow } from "@/lib/social-autopilot";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

export type NexusInboxSource = "system" | "approval" | "marketing" | "email_identity" | "buyer_criteria" | "shortlist_review" | "no_match";
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

export function buildNexusInbox(input: {
  attention: OsAttentionItem[];
  approvals: ApprovalItem[];
  marketingRows: SocialAutopilotRow[];
  emailIdentityReviews?: EmailIdentityReviewItem[];
  buyerCriteriaReviews?: BuyerCriteriaReviewItem[];
  shortlistReviews?: ShortlistReviewItem[];
  noMatchReviews?: NoMatchReviewItem[];
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

  for (const row of input.noMatchReviews ?? []) {
    const analyzed = Math.max(0, Number(row.analyzed || 0));
    const criteria = Array.isArray(row.criteria) ? row.criteria.filter(Boolean).slice(0, 4) : [];
    const context = criteria.length ? ` Registrert: ${criteria.join(" · ")}.` : "";
    const nextAction = String(row.nextAction || "Vurder om kunden bør spørres om fleksibilitet før kriteriene endres.").trim();
    items.push({
      id: `no-match:${row.id}`,
      source: "no_match",
      priority: String(row.priority || "HIGH").toUpperCase() === "CRITICAL" ? "critical" : "high",
      title: "Ingen gode boligtreff – trenger vurdering",
      reason: `${analyzed > 0 ? `Nexus analyserte ${analyzed} boliger uten å finne et godt nok treff.` : "Nexus fant ingen gode nok boligtreff."}${context} ${nextAction}`.trim(),
      href: row.reviewHref,
      actionLabel: "Vurder søk",
      customerName: row.customerName ?? null,
      occurredAt: row.updatedAt ?? null,
    });
  }

  return items.sort((a, b) => {
    const priorityDifference = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (priorityDifference) return priorityDifference;
    if (a.source === b.source && ["email_identity", "buyer_criteria", "shortlist_review", "no_match"].includes(a.source)) {
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
    system: items.filter((item) => item.source === "system").length,
  };
}
