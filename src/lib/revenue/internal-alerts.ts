import type { TeamWorkloadWorkspace } from "@/lib/revenue/team-workload";
import { buildClosingOpportunity } from "@/lib/revenue/closing";
import { buildCommissionCase } from "@/lib/revenue/commissions";
import { buildServiceRevenueAccount } from "@/lib/revenue/service-revenue";

export const INTERNAL_ALERT_CATEGORIES = ["TEAM", "CLOSING", "FINANCE", "KEYHOLDING", "EXECUTION"] as const;
export type InternalAlertCategory = (typeof INTERNAL_ALERT_CATEGORIES)[number];
export type InternalAlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type InternalAlertEscalation = "IMMEDIATE" | "TODAY" | "THIS_WEEK" | "MONITOR";
export type InternalAlertAckAction = "ACKNOWLEDGED" | "REOPENED";

export interface InternalAlertAcknowledgement {
  id: string;
  alertId: string;
  fingerprint: string;
  action: InternalAlertAckAction;
  at: string;
  actorEmail: string;
  note: string | null;
}

export interface InternalAlert {
  id: string;
  ruleId: string;
  fingerprint: string;
  category: InternalAlertCategory;
  severity: InternalAlertSeverity;
  escalation: InternalAlertEscalation;
  score: number;
  title: string;
  detail: string;
  reason: string;
  recommendedAction: string;
  brandId: string | null;
  resourceType: string;
  resourceId: string;
  contactId: string | null;
  ownerEmail: string | null;
  ownerName: string | null;
  dueAt: string | null;
  amountEur: number | null;
  href: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgementNote: string | null;
}

export interface InternalAlertCenter {
  generatedAt: string;
  alerts: InternalAlert[];
  active: InternalAlert[];
  acknowledged: InternalAlert[];
  summary: {
    total: number;
    active: number;
    acknowledged: number;
    critical: number;
    high: number;
    immediate: number;
    unassigned: number;
    overdue: number;
    byCategory: Record<InternalAlertCategory, number>;
  };
  warnings: string[];
}

interface AlertDraft extends Omit<InternalAlert, "fingerprint" | "acknowledged" | "acknowledgedAt" | "acknowledgedBy" | "acknowledgementNote"> {
  fingerprintParts: unknown[];
}

function safeDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeContact(contact: Record<string, unknown>) {
  return {
    ...contact,
    next_followup: contact.next_followup || contact.next_follow_up || contact.follow_up_date || null,
  };
}

function stableValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${key}:${stableValue(item)}`)
      .join(",")}}`;
  }
  return String(value);
}

function fingerprint(parts: unknown[]) {
  const input = stableValue(parts);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function severityWeight(value: InternalAlertSeverity) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[value];
}

function escalationFor(severity: InternalAlertSeverity, overdue = false): InternalAlertEscalation {
  if (severity === "CRITICAL") return "IMMEDIATE";
  if (severity === "HIGH" || overdue) return "TODAY";
  if (severity === "MEDIUM") return "THIS_WEEK";
  return "MONITOR";
}

function latestAcknowledgements(events: InternalAlertAcknowledgement[]) {
  const map = new Map<string, InternalAlertAcknowledgement>();
  [...events]
    .filter((event) => Boolean(event.alertId && event.at))
    .sort((a, b) => b.at.localeCompare(a.at))
    .forEach((event) => {
      if (!map.has(event.alertId)) map.set(event.alertId, event);
    });
  return map;
}

function withAcknowledgement(draft: AlertDraft, acknowledgements: Map<string, InternalAlertAcknowledgement>): InternalAlert {
  const alertFingerprint = fingerprint(draft.fingerprintParts);
  const event = acknowledgements.get(draft.id);
  const acknowledged = Boolean(event && event.action === "ACKNOWLEDGED" && event.fingerprint === alertFingerprint);
  const { fingerprintParts: _ignored, ...alert } = draft;
  return {
    ...alert,
    fingerprint: alertFingerprint,
    acknowledged,
    acknowledgedAt: acknowledged ? event?.at || null : null,
    acknowledgedBy: acknowledged ? event?.actorEmail || null : null,
    acknowledgementNote: acknowledged ? event?.note || null : null,
  };
}

function contactName(contact: Record<string, unknown>) {
  return String(contact.name || contact.email || "Ukjent kunde").trim() || "Ukjent kunde";
}

function alertDrafts(params: {
  contacts: Array<Record<string, unknown>>;
  team: TeamWorkloadWorkspace;
  now: Date;
}) {
  const drafts: AlertDraft[] = [];
  const { contacts, team, now } = params;

  for (const member of team.members) {
    if (member.load !== "HIGH") continue;
    const severity: InternalAlertSeverity = member.critical >= 2 || member.overdue >= 4 || member.totalScore >= 600 ? "CRITICAL" : "HIGH";
    drafts.push({
      id: `team-overload:${member.email}`,
      ruleId: "TEAM_OVERLOAD",
      category: "TEAM",
      severity,
      escalation: escalationFor(severity, member.overdue > 0),
      score: Math.min(100, 65 + member.critical * 10 + member.overdue * 4),
      title: `${member.displayName} har høy arbeidsbelastning`,
      detail: `${member.contacts} kunder, ${member.tasks} oppgaver, ${member.overdue} forfalte og ${member.critical} kritiske saker.`,
      reason: "Samlet belastningsscore har passert den interne terskelen.",
      recommendedAction: "Gjennomgå køen og flytt ansvar manuelt dersom kapasiteten er reelt overskredet.",
      brandId: null,
      resourceType: "team-member",
      resourceId: member.email,
      contactId: null,
      ownerEmail: member.email,
      ownerName: member.displayName,
      dueAt: now.toISOString(),
      amountEur: null,
      href: `/team-workload?member=${encodeURIComponent(member.email)}`,
      fingerprintParts: [member.load, member.contacts, member.tasks, member.overdue, member.critical, member.totalScore],
    });
  }

  for (const item of team.unassigned) {
    if (item.priority !== "CRITICAL" && !(item.overdue && item.priority === "HIGH")) continue;
    const severity: InternalAlertSeverity = item.priority === "CRITICAL" ? "CRITICAL" : "HIGH";
    drafts.push({
      id: `team-unassigned:${item.id}`,
      ruleId: "UNASSIGNED_PRIORITY_WORK",
      category: "TEAM",
      severity,
      escalation: escalationFor(severity, item.overdue),
      score: Math.min(100, item.score + 5),
      title: `Ufordelt ${item.resourceType === "CONTACT" ? "kunde" : "oppgave"}: ${item.title}`,
      detail: item.detail,
      reason: item.overdue ? "Saken er både prioritert, ufordelt og forfalt." : "En kritisk sak mangler ansvarlig.",
      recommendedAction: `Tildel saken manuelt til ${item.recommendedRoles[0] || "riktig rolle"} i Team & arbeidsfordeling.`,
      brandId: item.brandId,
      resourceType: item.resourceType.toLowerCase(),
      resourceId: item.resourceId,
      contactId: item.contactId,
      ownerEmail: null,
      ownerName: null,
      dueAt: item.dueDate,
      amountEur: null,
      href: "/team-workload?filter=unassigned",
      fingerprintParts: [item.priority, item.score, item.overdue, item.dueDate, item.recommendedRoles],
    });
  }

  for (const rawContact of contacts) {
    const contact = normalizeContact(rawContact);
    const closing = buildClosingOpportunity(contact as never, now);
    if (closing?.risk === "HIGH") {
      const due = safeDate(closing.nextFollowupAt);
      const overdue = !due || due.getTime() < now.getTime();
      const severity: InternalAlertSeverity = closing.stage === "NEGOTIATION" && (overdue || closing.blockers.length >= 3) ? "CRITICAL" : "HIGH";
      drafts.push({
        id: `closing-risk:${closing.id}`,
        ruleId: "CLOSING_HIGH_RISK",
        category: "CLOSING",
        severity,
        escalation: escalationFor(severity, overdue),
        score: Math.min(100, 70 + closing.blockers.length * 5 + (overdue ? 10 : 0)),
        title: `Closing-risiko: ${closing.name}`,
        detail: `${closing.stage} · ${closing.blockers.length} kritiske blokkeringer${closing.value ? ` · €${Math.round(closing.value).toLocaleString("nb-NO")}` : ""}.`,
        reason: overdue ? "Neste oppfølging mangler eller er forfalt." : closing.blockers.join(" · "),
        recommendedAction: closing.nextAction,
        brandId: closing.brandId,
        resourceType: "contact",
        resourceId: closing.id,
        contactId: closing.id,
        ownerEmail: null,
        ownerName: null,
        dueAt: closing.nextFollowupAt,
        amountEur: closing.value || null,
        href: "/closing",
        fingerprintParts: [closing.stage, closing.risk, closing.blockers, closing.nextFollowupAt, closing.value],
      });
    }

    const commission = buildCommissionCase(contact as never, now);
    if (commission && commission.status !== "PAID") {
      let severity: InternalAlertSeverity | null = null;
      let ruleId = "";
      if (commission.status === "OVERDUE") {
        severity = commission.daysOutstanding >= 30 || commission.commissionAmount >= 25_000 ? "CRITICAL" : "HIGH";
        ruleId = "COMMISSION_OVERDUE";
      } else if (commission.status === "MISSING_TERMS" && commission.ageDays >= 7) {
        severity = commission.ageDays >= 30 ? "HIGH" : "MEDIUM";
        ruleId = "COMMISSION_TERMS_MISSING";
      } else if (commission.status === "READY_TO_INVOICE" && commission.ageDays >= 7) {
        severity = commission.ageDays >= 21 ? "HIGH" : "MEDIUM";
        ruleId = "COMMISSION_NOT_INVOICED";
      } else if (commission.followupOverdue) {
        severity = "HIGH";
        ruleId = "COMMISSION_FOLLOWUP_OVERDUE";
      }
      if (severity) {
        const overdue = commission.status === "OVERDUE" || commission.followupOverdue;
        drafts.push({
          id: `finance-alert:${ruleId}:${commission.id}`,
          ruleId,
          category: "FINANCE",
          severity,
          escalation: escalationFor(severity, overdue),
          score: Math.min(100, commission.score + (severity === "CRITICAL" ? 10 : 0)),
          title: `Provisjon: ${commission.name}`,
          detail: `${commission.status} · ${commission.commissionConfirmed ? `€${Math.round(commission.commissionAmount).toLocaleString("nb-NO")}` : "provisjonsgrunnlag mangler"}.`,
          reason: commission.issues.join(" · ") || "Saken krever økonomisk oppfølging.",
          recommendedAction: commission.recommendedAction,
          brandId: commission.brandId,
          resourceType: "contact",
          resourceId: commission.id,
          contactId: commission.id,
          ownerEmail: null,
          ownerName: null,
          dueAt: commission.invoiceDueAt || commission.nextFollowupAt,
          amountEur: commission.commissionConfirmed ? commission.commissionAmount : null,
          href: "/commissions",
          fingerprintParts: [commission.status, commission.commissionAmount, commission.commissionConfirmed, commission.invoiceDueAt, commission.nextFollowupAt, commission.daysOutstanding, commission.issues],
        });
      }
    }

    const service = buildServiceRevenueAccount(contact as never, now);
    if (service && ["RENEWAL_DUE", "PAUSED", "OFFERED"].includes(service.lifecycle)) {
      const renewal = safeDate(service.renewalAt);
      const renewalOverdue = Boolean(service.lifecycle === "RENEWAL_DUE" && renewal && renewal.getTime() < now.getTime());
      const shouldAlert = service.lifecycle === "RENEWAL_DUE" || service.overdue || (service.lifecycle === "OFFERED" && !service.nextFollowupAt);
      if (shouldAlert) {
        const severity: InternalAlertSeverity = renewalOverdue || (service.lifecycle === "RENEWAL_DUE" && service.overdue) ? "CRITICAL" : "HIGH";
        drafts.push({
          id: `keyholding-alert:${service.lifecycle}:${service.id}`,
          ruleId: service.lifecycle === "RENEWAL_DUE" ? "KEYHOLDING_RENEWAL" : service.lifecycle === "PAUSED" ? "KEYHOLDING_PAUSED" : "KEYHOLDING_OFFER_FOLLOWUP",
          category: "KEYHOLDING",
          severity,
          escalation: escalationFor(severity, service.overdue || renewalOverdue),
          score: Math.min(100, service.score + (renewalOverdue ? 10 : 0)),
          title: `Keyholding: ${service.name}`,
          detail: `${service.lifecycle} · ${service.currentPlan || service.recommendedPlan} · €${service.monthlyRevenue || service.potentialMonthlyRevenue}/mnd.`,
          reason: service.issues.join(" · ") || "Keyholding-saken krever intern oppfølging.",
          recommendedAction: service.recommendedAction,
          brandId: "keyholding",
          resourceType: "contact",
          resourceId: service.id,
          contactId: service.id,
          ownerEmail: null,
          ownerName: null,
          dueAt: service.renewalAt || service.nextFollowupAt,
          amountEur: service.monthlyRevenue || service.potentialMonthlyRevenue || null,
          href: "/service-revenue",
          fingerprintParts: [service.lifecycle, service.renewalAt, service.nextFollowupAt, service.currentPlan, service.overdue, service.issues],
        });
      }
    }
  }

  for (const item of team.items) {
    if (item.resourceType !== "TASK" || !item.ownerEmail || !item.overdue || !["CRITICAL", "HIGH"].includes(item.priority)) continue;
    const severity: InternalAlertSeverity = item.priority === "CRITICAL" ? "CRITICAL" : "HIGH";
    drafts.push({
      id: `execution-overdue:${item.resourceId}`,
      ruleId: "ASSIGNED_TASK_OVERDUE",
      category: "EXECUTION",
      severity,
      escalation: escalationFor(severity, true),
      score: item.score,
      title: `Forfalt oppgave: ${item.title}`,
      detail: item.detail,
      reason: `Oppgaven er forfalt og står fortsatt på ${item.ownerName || item.ownerEmail}.`,
      recommendedAction: "Avklar om oppgaven skal fullføres, flyttes eller få ny realistisk frist.",
      brandId: item.brandId,
      resourceType: "task",
      resourceId: item.resourceId,
      contactId: item.contactId,
      ownerEmail: item.ownerEmail,
      ownerName: item.ownerName,
      dueAt: item.dueDate,
      amountEur: null,
      href: "/execution",
      fingerprintParts: [item.priority, item.score, item.dueDate, item.ownerEmail, item.detail],
    });
  }

  return drafts;
}

export function buildInternalAlertCenter(params: {
  contacts?: Array<Record<string, unknown>>;
  team: TeamWorkloadWorkspace;
  acknowledgements?: InternalAlertAcknowledgement[];
  now?: Date;
  warnings?: string[];
}): InternalAlertCenter {
  const now = params.now || new Date();
  const acknowledgementMap = latestAcknowledgements(params.acknowledgements || []);
  const alerts = alertDrafts({ contacts: params.contacts || [], team: params.team, now })
    .map((draft) => withAcknowledgement(draft, acknowledgementMap))
    .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged)
      || severityWeight(b.severity) - severityWeight(a.severity)
      || b.score - a.score
      || String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"))
      || a.title.localeCompare(b.title));
  const active = alerts.filter((alert) => !alert.acknowledged);
  const acknowledged = alerts.filter((alert) => alert.acknowledged);
  const byCategory = Object.fromEntries(INTERNAL_ALERT_CATEGORIES.map((category) => [category, active.filter((alert) => alert.category === category).length])) as Record<InternalAlertCategory, number>;
  return {
    generatedAt: now.toISOString(),
    alerts,
    active,
    acknowledged,
    summary: {
      total: alerts.length,
      active: active.length,
      acknowledged: acknowledged.length,
      critical: active.filter((alert) => alert.severity === "CRITICAL").length,
      high: active.filter((alert) => alert.severity === "HIGH").length,
      immediate: active.filter((alert) => alert.escalation === "IMMEDIATE").length,
      unassigned: active.filter((alert) => alert.ruleId === "UNASSIGNED_PRIORITY_WORK").length,
      overdue: active.filter((alert) => Boolean(alert.dueAt && safeDate(alert.dueAt) && safeDate(alert.dueAt)!.getTime() < now.getTime())).length,
      byCategory,
    },
    warnings: [...(params.warnings || [])],
  };
}
