import type { SocialAutopilotRow } from "@/lib/social-autopilot";
import { summarizeSocialAutopilot } from "@/lib/social-autopilot";

export type NexusInboxSource = "system" | "approval" | "marketing" | "email_identity";
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
};

const PRIORITY_WEIGHT: Record<NexusInboxPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function osPriority(severity: OsAttentionItem["severity"]): NexusInboxPriority {
  if (severity === "high") return "critical";
  if (severity === "medium") return "high";
  return "medium";
}

export function buildNexusInbox(input: {
  attention: OsAttentionItem[];
  approvals: ApprovalItem[];
  marketingRows: SocialAutopilotRow[];
  emailIdentityReviews?: EmailIdentityReviewItem[];
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
    });
  }

  return items.sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] || a.title.localeCompare(b.title, "nb"));
}

export function summarizeNexusInbox(items: NexusInboxItem[]) {
  return {
    total: items.length,
    critical: items.filter((item) => item.priority === "critical").length,
    approvals: items.filter((item) => item.source === "approval").length,
    marketing: items.filter((item) => item.source === "marketing").length,
    emailIdentity: items.filter((item) => item.source === "email_identity").length,
    system: items.filter((item) => item.source === "system").length,
  };
}
