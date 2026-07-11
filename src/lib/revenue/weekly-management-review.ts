import { normalizeRole, type AccessRole } from "@/lib/access-control";
import {
  buildOperatingReviewJournal,
  madridDate,
  operatingReviewFingerprint,
  type OperatingDecisionStatus,
  type OperatingReviewSettings,
} from "@/lib/revenue/operating-review";
import type { ExecutiveDecisionSeverity, ExecutiveDecisionSource } from "@/lib/revenue/executive-briefing";

export const WEEKLY_MANAGEMENT_SETTINGS_KEY = "weekly-management:journal";
export const WEEKLY_ISSUE_STATUSES = [
  "OPEN",
  "MONITOR",
  "CORRECTIVE_ACTION",
  "ESCALATED",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const;
export type WeeklyIssueStatus = (typeof WEEKLY_ISSUE_STATUSES)[number];

export const WEEKLY_MANAGEMENT_EVENT_TYPES = [
  "WEEK_CAPTURED",
  "WEEK_REFRESHED",
  "ISSUE_UPDATED",
  "WEEK_NOTE_ADDED",
  "WEEK_COMPLETED",
  "WEEK_REOPENED",
] as const;
export type WeeklyManagementEventType = (typeof WEEKLY_MANAGEMENT_EVENT_TYPES)[number];

export type WeeklyIssueType =
  | "OVERDUE_FOLLOWUP"
  | "REPEATED_DEFERRAL"
  | "STALLED_DECISION"
  | "UNDECIDED_REPEAT"
  | "SOURCE_BOTTLENECK"
  | "REVIEW_DISCIPLINE";

export interface WeeklyOutcomeMetrics {
  reviews: number;
  completedReviews: number;
  reviewCompletionRate: number | null;
  uniqueDecisions: number;
  decisionsRecorded: number;
  decisionsResolved: number;
  decisionsCompleted: number;
  decisionsNoAction: number;
  decisionsOpen: number;
  activeFollowups: number;
  overdueFollowups: number;
  repeatedDeferrals: number;
  completionRate: number | null;
  decisionCoverageRate: number | null;
  onTimeCompletionRate: number | null;
  averageActiveAgeDays: number | null;
}

export interface WeeklyOutcomeBreakdown {
  id: string;
  label: string;
  decisions: number;
  resolved: number;
  active: number;
  overdue: number;
  repeatedDeferrals: number;
  completionRate: number | null;
}

export interface WeeklyManagementIssue {
  id: string;
  fingerprint: string;
  type: WeeklyIssueType;
  severity: ExecutiveDecisionSeverity;
  source: ExecutiveDecisionSource | "MANAGEMENT";
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  decisionKey: string | null;
  appearances: number;
  deferrals: number;
  daysOpen: number | null;
  amountEur: number | null;
}

export interface WeeklyManagementSnapshot {
  id: string;
  weekStart: string;
  weekEnd: string;
  revision: number;
  capturedAt: string;
  capturedBy: string;
  capturedRole: AccessRole;
  metrics: WeeklyOutcomeMetrics;
  previousWeek: WeeklyOutcomeMetrics | null;
  comparison: {
    completionRateDelta: number | null;
    overdueFollowupsDelta: number | null;
    repeatedDeferralsDelta: number | null;
  };
  bySource: WeeklyOutcomeBreakdown[];
  byRole: WeeklyOutcomeBreakdown[];
  issues: WeeklyManagementIssue[];
  warnings: string[];
  fingerprint: string;
}

export interface WeeklyManagementEvent {
  id: string;
  type: WeeklyManagementEventType;
  at: string;
  actorEmail: string;
  actorRole: AccessRole;
  reviewId: string;
  weekStart: string;
  snapshot: WeeklyManagementSnapshot | null;
  issueId: string | null;
  issueFingerprint: string | null;
  previousStatus: WeeklyIssueStatus | null;
  status: WeeklyIssueStatus | null;
  note: string | null;
  followupAt: string | null;
  responsibleEmail: string | null;
}

export interface WeeklyManagementSettings {
  version: 1;
  events: WeeklyManagementEvent[];
  updatedAt: string | null;
}

export interface WeeklyIssueView extends WeeklyManagementIssue {
  status: WeeklyIssueStatus;
  note: string | null;
  followupAt: string | null;
  responsibleEmail: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  overdue: boolean;
  hasRecordedConclusion: boolean;
}

export interface WeeklyManagementReviewView extends Omit<WeeklyManagementSnapshot, "issues"> {
  issues: WeeklyIssueView[];
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
  lastUpdatedAt: string;
  openIssues: number;
  activeActions: number;
  overdueActions: number;
  conclusionCoverageRate: number;
  notes: Array<{ id: string; at: string; actorEmail: string; note: string }>;
}

export interface WeeklyManagementJournal {
  generatedAt: string;
  role: AccessRole;
  currentWeekStart: string;
  currentReviewId: string | null;
  summary: {
    reviews: number;
    completedReviews: number;
    openReviews: number;
    openIssues: number;
    activeActions: number;
    overdueActions: number;
    conclusionsLast28Days: number;
  };
  reviews: WeeklyManagementReviewView[];
  safety: {
    appendOnlyHistory: true;
    serverGeneratedAnalytics: true;
    automaticTaskCreation: false;
    automaticCustomerContact: false;
    automaticPipelineChanges: false;
    journalResponsibilityIsNotAssignment: true;
  };
}

type DecisionGroup = {
  key: string;
  source: ExecutiveDecisionSource;
  severity: ExecutiveDecisionSeverity;
  title: string;
  subject: string;
  href: string;
  amountEur: number | null;
  firstSeen: string;
  lastSeen: string;
  appearances: number;
  roles: Set<AccessRole>;
  latestRole: AccessRole;
  latestStatus: OperatingDecisionStatus;
  latestFollowupAt: string | null;
  latestOverdue: boolean;
  openOccurrences: number;
  deferredEvents: number;
  completionWithDeadline: number;
  onTimeCompletions: number;
};

const ISSUE_STATUS_SET = new Set<WeeklyIssueStatus>(WEEKLY_ISSUE_STATUSES);
const EVENT_TYPE_SET = new Set<WeeklyManagementEventType>(WEEKLY_MANAGEMENT_EVENT_TYPES);
const REVIEW_ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_EVENTS = 1600;
const MAX_REVIEWS = 104;
const ACTIVE_ISSUE_STATUSES = new Set<WeeklyIssueStatus>(["MONITOR", "CORRECTIVE_ACTION", "ESCALATED"]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function emailValue(value: unknown) {
  const valueClean = clean(value, 320).toLowerCase();
  return valueClean.includes("@") ? valueClean : "";
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeIso(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function dateOnly(value: unknown) {
  const raw = clean(value, 10);
  if (!DATE_PATTERN.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

function dateAtNoon(value: string) {
  return new Date(`${value}T12:00:00.000Z`);
}

function addDays(value: string, days: number) {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function madridWeekStart(value: Date | string) {
  const current = madridDate(value);
  if (!current) return "";
  const date = dateAtNoon(current);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: string, end: string) {
  return Math.max(0, Math.floor((dateAtNoon(end).getTime() - dateAtNoon(start).getTime()) / 86_400_000));
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function severityRank(value: ExecutiveDecisionSeverity) {
  return value === "CRITICAL" ? 3 : value === "HIGH" ? 2 : 1;
}

function analyzeWeek(settings: OperatingReviewSettings, role: AccessRole, weekStart: string, now: Date) {
  const weekEnd = addDays(weekStart, 6);
  const journal = buildOperatingReviewJournal(settings, role, now);
  const reviews = journal.reviews.filter((review) => review.reviewDate >= weekStart && review.reviewDate <= weekEnd);
  const groups = new Map<string, DecisionGroup>();

  for (const review of reviews) {
    for (const decision of review.decisions) {
      const key = `${decision.source}:${decision.id}`;
      const existing = groups.get(key);
      const base: DecisionGroup = existing || {
        key,
        source: decision.source,
        severity: decision.severity,
        title: decision.title,
        subject: decision.subject,
        href: decision.href,
        amountEur: decision.amountEur,
        firstSeen: review.reviewDate,
        lastSeen: review.reviewDate,
        appearances: 0,
        roles: new Set<AccessRole>(),
        latestRole: review.capturedRole,
        latestStatus: decision.status,
        latestFollowupAt: decision.followupAt,
        latestOverdue: decision.overdue,
        openOccurrences: 0,
        deferredEvents: 0,
        completionWithDeadline: 0,
        onTimeCompletions: 0,
      };
      base.appearances += 1;
      base.roles.add(review.capturedRole);
      base.firstSeen = base.firstSeen < review.reviewDate ? base.firstSeen : review.reviewDate;
      if (review.reviewDate >= base.lastSeen) {
        base.lastSeen = review.reviewDate;
        base.latestRole = review.capturedRole;
        base.latestStatus = decision.status;
        base.latestFollowupAt = decision.followupAt;
        base.latestOverdue = decision.overdue;
        base.title = decision.title;
        base.subject = decision.subject;
        base.href = decision.href;
        base.amountEur = decision.amountEur;
        if (severityRank(decision.severity) > severityRank(base.severity)) base.severity = decision.severity;
      }
      if (decision.status === "OPEN") base.openOccurrences += 1;

      const decisionEvents = settings.events
        .filter((event) => event.type === "DECISION_UPDATED" && event.reviewId === review.id && event.decisionId === decision.id && event.decisionFingerprint === decision.fingerprint)
        .sort((a, b) => a.at.localeCompare(b.at));
      let deadline: string | null = null;
      for (const event of decisionEvents) {
        if (event.status === "DEFERRED") base.deferredEvents += 1;
        if (["ACTION_PLANNED", "DEFERRED", "ESCALATED"].includes(event.status || "") && event.followupAt) deadline = event.followupAt;
        if (event.status === "COMPLETED" && deadline) {
          base.completionWithDeadline += 1;
          if (event.at.slice(0, 10) <= deadline) base.onTimeCompletions += 1;
        }
      }
      groups.set(key, base);
    }
  }

  const rows = [...groups.values()];
  const resolved = rows.filter((row) => ["COMPLETED", "NO_ACTION"].includes(row.latestStatus)).length;
  const completed = rows.filter((row) => row.latestStatus === "COMPLETED").length;
  const noAction = rows.filter((row) => row.latestStatus === "NO_ACTION").length;
  const recorded = rows.filter((row) => row.latestStatus !== "OPEN").length;
  const open = rows.filter((row) => row.latestStatus === "OPEN").length;
  const active = rows.filter((row) => ["ACTION_PLANNED", "DEFERRED", "ESCALATED"].includes(row.latestStatus)).length;
  const overdue = rows.filter((row) => row.latestOverdue).length;
  const repeatedDeferrals = rows.filter((row) => row.deferredEvents >= 2).length;
  const deadlineCompletions = rows.reduce((sum, row) => sum + row.completionWithDeadline, 0);
  const onTimeCompletions = rows.reduce((sum, row) => sum + row.onTimeCompletions, 0);
  const activeRows = rows.filter((row) => !["COMPLETED", "NO_ACTION"].includes(row.latestStatus));
  const currentDay = madridDate(now);
  const metrics: WeeklyOutcomeMetrics = {
    reviews: reviews.length,
    completedReviews: reviews.filter((review) => review.completed).length,
    reviewCompletionRate: percentage(reviews.filter((review) => review.completed).length, reviews.length),
    uniqueDecisions: rows.length,
    decisionsRecorded: recorded,
    decisionsResolved: resolved,
    decisionsCompleted: completed,
    decisionsNoAction: noAction,
    decisionsOpen: open,
    activeFollowups: active,
    overdueFollowups: overdue,
    repeatedDeferrals,
    completionRate: percentage(resolved, rows.length),
    decisionCoverageRate: percentage(recorded, rows.length),
    onTimeCompletionRate: percentage(onTimeCompletions, deadlineCompletions),
    averageActiveAgeDays: activeRows.length
      ? Math.round(activeRows.reduce((sum, row) => sum + daysBetween(row.firstSeen, currentDay), 0) / activeRows.length)
      : null,
  };

  const breakdown = (selector: (row: DecisionGroup) => string, labels: Map<string, string>): WeeklyOutcomeBreakdown[] => {
    const map = new Map<string, DecisionGroup[]>();
    rows.forEach((row) => {
      const id = selector(row);
      map.set(id, [...(map.get(id) || []), row]);
    });
    return [...map.entries()].map(([id, items]) => {
      const itemResolved = items.filter((item) => ["COMPLETED", "NO_ACTION"].includes(item.latestStatus)).length;
      return {
        id,
        label: labels.get(id) || id,
        decisions: items.length,
        resolved: itemResolved,
        active: items.filter((item) => !["COMPLETED", "NO_ACTION"].includes(item.latestStatus)).length,
        overdue: items.filter((item) => item.latestOverdue).length,
        repeatedDeferrals: items.filter((item) => item.deferredEvents >= 2).length,
        completionRate: percentage(itemResolved, items.length),
      };
    }).sort((a, b) => b.active - a.active || b.overdue - a.overdue || a.label.localeCompare(b.label));
  };

  const sourceLabels = new Map<string, string>([
    ["ALERTS", "Varsler"], ["SALES", "Salg"], ["CLOSING", "Closing"], ["FINANCE", "Økonomi"],
    ["KEYHOLDING", "Keyholding"], ["EXECUTION", "Execution"], ["GOALS", "Mål"], ["TEAM", "Team"],
  ]);
  const roleLabels = new Map<string, string>([
    ["OWNER", "Owner"], ["SALES", "Sales"], ["CLOSING", "Closing"], ["FINANCE", "Finance"],
    ["MARKETING", "Marketing"], ["KEYHOLDING", "Keyholding"], ["VIEWER", "Read-only"],
  ]);

  const issues: WeeklyManagementIssue[] = [];
  for (const row of rows) {
    const daysOpen = daysBetween(row.firstSeen, currentDay);
    let type: WeeklyIssueType | null = null;
    let severity: ExecutiveDecisionSeverity = row.severity;
    let detail = "";
    let recommendedAction = "";
    if (row.latestOverdue) {
      type = "OVERDUE_FOLLOWUP";
      severity = row.severity === "CRITICAL" || daysOpen >= 7 ? "CRITICAL" : "HIGH";
      detail = `Oppfølgingen er forfalt. Saken har vært synlig i ${row.appearances} gjennomganger over ${daysOpen} dager.`;
      recommendedAction = "Avklar neste konkrete steg, ansvarlig og ny realistisk frist i den autoritative arbeidsflaten.";
    } else if (row.deferredEvents >= 2) {
      type = "REPEATED_DEFERRAL";
      severity = row.deferredEvents >= 3 ? "CRITICAL" : "HIGH";
      detail = `Beslutningen er utsatt ${row.deferredEvents} ganger og er fortsatt ${row.latestStatus.toLowerCase()}.`;
      recommendedAction = "Fjern blokkeringen eller eskaler beslutningen med tydelig eier og frist.";
    } else if (row.appearances >= 3 && !["COMPLETED", "NO_ACTION"].includes(row.latestStatus)) {
      type = "STALLED_DECISION";
      severity = row.appearances >= 5 ? "HIGH" : "MEDIUM";
      detail = `Saken har gått igjen i ${row.appearances} daglige gjennomganger uten endelig utfall.`;
      recommendedAction = "Bestem om saken skal gjennomføres, eskaleres eller avsluttes uten handling.";
    } else if (row.openOccurrences >= 2) {
      type = "UNDECIDED_REPEAT";
      severity = "MEDIUM";
      detail = `Saken har stått uten registrert konklusjon i ${row.openOccurrences} gjennomganger.`;
      recommendedAction = "Registrer en eksplisitt konklusjon og eventuell oppfølgingsdato.";
    }
    if (!type) continue;
    const base = {
      type,
      severity,
      source: row.source,
      title: type === "REPEATED_DEFERRAL" ? "Gjentatt utsettelse" : type === "OVERDUE_FOLLOWUP" ? "Forfalt beslutningsoppfølging" : "Beslutning uten fremdrift",
      subject: row.subject || row.title,
      detail,
      recommendedAction,
      href: row.href,
      decisionKey: row.key,
      appearances: row.appearances,
      deferrals: row.deferredEvents,
      daysOpen,
      amountEur: row.amountEur,
    };
    issues.push({ id: `weekly:${type}:${operatingReviewFingerprint(row.key)}`, fingerprint: operatingReviewFingerprint(base), ...base });
  }

  const bySource = breakdown((row) => row.source, sourceLabels);
  for (const source of bySource) {
    if (source.decisions < 3 || (source.completionRate ?? 100) >= 40 || source.active < 2) continue;
    const base = {
      type: "SOURCE_BOTTLENECK" as const,
      severity: source.overdue > 0 || source.repeatedDeferrals > 0 ? "HIGH" as const : "MEDIUM" as const,
      source: source.id as ExecutiveDecisionSource,
      title: "Flaskehals i arbeidsområde",
      subject: source.label,
      detail: `${source.active} aktive beslutninger og ${source.completionRate ?? 0}% løsningsgrad denne uken.`,
      recommendedAction: "Gjennomgå kapasitet, beslutningsmyndighet og blokkeringer i dette arbeidsområdet.",
      href: "/operating-review",
      decisionKey: null,
      appearances: source.decisions,
      deferrals: source.repeatedDeferrals,
      daysOpen: null,
      amountEur: null,
    };
    issues.push({ id: `weekly:SOURCE:${source.id}`, fingerprint: operatingReviewFingerprint(base), ...base });
  }
  if (reviews.length >= 2 && (metrics.reviewCompletionRate ?? 100) < 60) {
    const base = {
      type: "REVIEW_DISCIPLINE" as const,
      severity: "MEDIUM" as const,
      source: "MANAGEMENT" as const,
      title: "Daglige gjennomganger blir ikke fullført",
      subject: `${metrics.completedReviews} av ${metrics.reviews} gjennomganger fullført`,
      detail: "Lav fullføringsgrad svekker beslutningshistorikken og oppfølgingen mellom dagene.",
      recommendedAction: "Avslutt daglige gjennomganger når alle beslutninger har fått en eksplisitt konklusjon.",
      href: "/operating-review",
      decisionKey: null,
      appearances: reviews.length,
      deferrals: 0,
      daysOpen: null,
      amountEur: null,
    };
    issues.push({ id: "weekly:REVIEW_DISCIPLINE", fingerprint: operatingReviewFingerprint(base), ...base });
  }

  return {
    weekStart,
    weekEnd,
    metrics,
    rows,
    bySource,
    byRole: breakdown((row) => row.latestRole, roleLabels),
    issues: issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.deferrals - a.deferrals || (b.daysOpen || 0) - (a.daysOpen || 0)).slice(0, 12),
    warnings: reviews.length === 0 ? ["Ingen daglige Operating Review-snapshots er registrert for denne uken."] : [],
  };
}

export function createWeeklyManagementSnapshot(
  operatingSettings: OperatingReviewSettings,
  role: AccessRole,
  actorEmail: string,
  now = new Date(),
  options: { reviewId?: string; revision?: number } = {},
): WeeklyManagementSnapshot {
  const weekStart = madridWeekStart(now);
  const current = analyzeWeek(operatingSettings, role, weekStart, now);
  const previous = analyzeWeek(operatingSettings, role, addDays(weekStart, -7), now);
  const previousMetrics = previous.metrics.reviews || previous.metrics.uniqueDecisions ? previous.metrics : null;
  const base = {
    id: options.reviewId || crypto.randomUUID(),
    weekStart,
    weekEnd: current.weekEnd,
    revision: Math.max(1, Math.floor(options.revision || 1)),
    capturedAt: now.toISOString(),
    capturedBy: actorEmail.trim().toLowerCase(),
    capturedRole: role,
    metrics: current.metrics,
    previousWeek: previousMetrics,
    comparison: {
      completionRateDelta: current.metrics.completionRate !== null && previousMetrics?.completionRate !== null && previousMetrics?.completionRate !== undefined
        ? current.metrics.completionRate - previousMetrics.completionRate : null,
      overdueFollowupsDelta: previousMetrics ? current.metrics.overdueFollowups - previousMetrics.overdueFollowups : null,
      repeatedDeferralsDelta: previousMetrics ? current.metrics.repeatedDeferrals - previousMetrics.repeatedDeferrals : null,
    },
    bySource: current.bySource,
    byRole: current.byRole,
    issues: current.issues,
    warnings: current.warnings,
  };
  return { ...base, fingerprint: operatingReviewFingerprint(base) };
}

function parseMetrics(value: unknown): WeeklyOutcomeMetrics {
  const row = record(value);
  return {
    reviews: numberValue(row.reviews),
    completedReviews: numberValue(row.completedReviews ?? row.completed_reviews),
    reviewCompletionRate: nullableNumber(row.reviewCompletionRate ?? row.review_completion_rate),
    uniqueDecisions: numberValue(row.uniqueDecisions ?? row.unique_decisions),
    decisionsRecorded: numberValue(row.decisionsRecorded ?? row.decisions_recorded),
    decisionsResolved: numberValue(row.decisionsResolved ?? row.decisions_resolved),
    decisionsCompleted: numberValue(row.decisionsCompleted ?? row.decisions_completed),
    decisionsNoAction: numberValue(row.decisionsNoAction ?? row.decisions_no_action),
    decisionsOpen: numberValue(row.decisionsOpen ?? row.decisions_open),
    activeFollowups: numberValue(row.activeFollowups ?? row.active_followups),
    overdueFollowups: numberValue(row.overdueFollowups ?? row.overdue_followups),
    repeatedDeferrals: numberValue(row.repeatedDeferrals ?? row.repeated_deferrals),
    completionRate: nullableNumber(row.completionRate ?? row.completion_rate),
    decisionCoverageRate: nullableNumber(row.decisionCoverageRate ?? row.decision_coverage_rate),
    onTimeCompletionRate: nullableNumber(row.onTimeCompletionRate ?? row.on_time_completion_rate),
    averageActiveAgeDays: nullableNumber(row.averageActiveAgeDays ?? row.average_active_age_days),
  };
}

function parseBreakdown(value: unknown): WeeklyOutcomeBreakdown | null {
  const row = record(value);
  const id = clean(row.id, 100);
  if (!id) return null;
  return {
    id,
    label: clean(row.label, 200) || id,
    decisions: numberValue(row.decisions),
    resolved: numberValue(row.resolved),
    active: numberValue(row.active),
    overdue: numberValue(row.overdue),
    repeatedDeferrals: numberValue(row.repeatedDeferrals ?? row.repeated_deferrals),
    completionRate: nullableNumber(row.completionRate ?? row.completion_rate),
  };
}

function parseIssue(value: unknown): WeeklyManagementIssue | null {
  const row = record(value);
  const id = clean(row.id, 500);
  const type = clean(row.type, 50).toUpperCase() as WeeklyIssueType;
  const severity = clean(row.severity, 20).toUpperCase() as ExecutiveDecisionSeverity;
  const source = clean(row.source, 30).toUpperCase() as WeeklyManagementIssue["source"];
  if (!REVIEW_ID_PATTERN.test(id) || !["OVERDUE_FOLLOWUP", "REPEATED_DEFERRAL", "STALLED_DECISION", "UNDECIDED_REPEAT", "SOURCE_BOTTLENECK", "REVIEW_DISCIPLINE"].includes(type)) return null;
  if (!["CRITICAL", "HIGH", "MEDIUM"].includes(severity)) return null;
  const base = {
    type,
    severity,
    source,
    title: clean(row.title, 300),
    subject: clean(row.subject, 500),
    detail: clean(row.detail, 2000),
    recommendedAction: clean(row.recommendedAction || row.recommended_action, 2000),
    href: clean(row.href, 1000) || "/operating-review",
    decisionKey: clean(row.decisionKey || row.decision_key, 500) || null,
    appearances: numberValue(row.appearances),
    deferrals: numberValue(row.deferrals),
    daysOpen: nullableNumber(row.daysOpen ?? row.days_open),
    amountEur: nullableNumber(row.amountEur ?? row.amount_eur),
  };
  return { id, fingerprint: clean(row.fingerprint, 64) || operatingReviewFingerprint(base), ...base };
}

function parseSnapshot(value: unknown): WeeklyManagementSnapshot | null {
  const row = record(value);
  const id = clean(row.id, 500);
  const weekStart = dateOnly(row.weekStart || row.week_start);
  const weekEnd = dateOnly(row.weekEnd || row.week_end);
  const capturedAt = safeIso(row.capturedAt || row.captured_at);
  const capturedBy = emailValue(row.capturedBy || row.captured_by);
  const capturedRole = normalizeRole(row.capturedRole || row.captured_role);
  if (!REVIEW_ID_PATTERN.test(id) || !weekStart || !weekEnd || !capturedAt || !capturedBy || !capturedRole) return null;
  const issues = (Array.isArray(row.issues) ? row.issues : []).map(parseIssue).filter(Boolean) as WeeklyManagementIssue[];
  const bySource = (Array.isArray(row.bySource || row.by_source) ? (row.bySource || row.by_source) as unknown[] : []).map(parseBreakdown).filter(Boolean) as WeeklyOutcomeBreakdown[];
  const byRole = (Array.isArray(row.byRole || row.by_role) ? (row.byRole || row.by_role) as unknown[] : []).map(parseBreakdown).filter(Boolean) as WeeklyOutcomeBreakdown[];
  const comparisonRow = record(row.comparison);
  const base = {
    id,
    weekStart,
    weekEnd,
    revision: Math.max(1, Math.floor(numberValue(row.revision, 1))),
    capturedAt,
    capturedBy,
    capturedRole,
    metrics: parseMetrics(row.metrics),
    previousWeek: row.previousWeek || row.previous_week ? parseMetrics(row.previousWeek || row.previous_week) : null,
    comparison: {
      completionRateDelta: nullableNumber(comparisonRow.completionRateDelta ?? comparisonRow.completion_rate_delta),
      overdueFollowupsDelta: nullableNumber(comparisonRow.overdueFollowupsDelta ?? comparisonRow.overdue_followups_delta),
      repeatedDeferralsDelta: nullableNumber(comparisonRow.repeatedDeferralsDelta ?? comparisonRow.repeated_deferrals_delta),
    },
    bySource,
    byRole,
    issues,
    warnings: (Array.isArray(row.warnings) ? row.warnings : []).map((item) => clean(item, 1000)).filter(Boolean).slice(0, 50),
  };
  return { ...base, fingerprint: clean(row.fingerprint, 64) || operatingReviewFingerprint(base) };
}

function parseEvent(value: unknown): WeeklyManagementEvent | null {
  const row = record(value);
  const id = clean(row.id, 500);
  const type = clean(row.type, 50).toUpperCase() as WeeklyManagementEventType;
  const at = safeIso(row.at || row.created_at);
  const actorEmail = emailValue(row.actorEmail || row.actor_email);
  const actorRole = normalizeRole(row.actorRole || row.actor_role);
  const reviewId = clean(row.reviewId || row.review_id, 500);
  const weekStart = dateOnly(row.weekStart || row.week_start);
  if (!REVIEW_ID_PATTERN.test(id) || !EVENT_TYPE_SET.has(type) || !at || !actorEmail || !actorRole || !REVIEW_ID_PATTERN.test(reviewId) || !weekStart) return null;
  const snapshot = parseSnapshot(row.snapshot);
  if (["WEEK_CAPTURED", "WEEK_REFRESHED"].includes(type) && (!snapshot || snapshot.id !== reviewId)) return null;
  const statusRaw = clean(row.status, 50).toUpperCase() as WeeklyIssueStatus;
  const previousRaw = clean(row.previousStatus || row.previous_status, 50).toUpperCase() as WeeklyIssueStatus;
  const issueId = clean(row.issueId || row.issue_id, 500) || null;
  const issueFingerprint = clean(row.issueFingerprint || row.issue_fingerprint, 64) || null;
  if (type === "ISSUE_UPDATED" && (!issueId || !issueFingerprint || !ISSUE_STATUS_SET.has(statusRaw))) return null;
  return {
    id,
    type,
    at,
    actorEmail,
    actorRole,
    reviewId,
    weekStart,
    snapshot,
    issueId,
    issueFingerprint,
    previousStatus: ISSUE_STATUS_SET.has(previousRaw) ? previousRaw : null,
    status: ISSUE_STATUS_SET.has(statusRaw) ? statusRaw : null,
    note: clean(row.note, 1000) || null,
    followupAt: dateOnly(row.followupAt || row.followup_at),
    responsibleEmail: emailValue(row.responsibleEmail || row.responsible_email) || null,
  };
}

export function compactWeeklyManagementEvents(events: WeeklyManagementEvent[]) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const reviewIds: string[] = [];
  for (const event of sorted) {
    if (!event.snapshot || reviewIds.includes(event.reviewId)) continue;
    reviewIds.push(event.reviewId);
    if (reviewIds.length >= MAX_REVIEWS) break;
  }
  const keep = new Set(reviewIds);
  return sorted.filter((event) => keep.has(event.reviewId)).slice(0, MAX_EVENTS);
}

export function parseWeeklyManagementSettings(value: unknown, updatedAt?: unknown): WeeklyManagementSettings {
  const row = record(value);
  const events = (Array.isArray(row.events) ? row.events : []).map(parseEvent).filter(Boolean) as WeeklyManagementEvent[];
  return { version: 1, events: compactWeeklyManagementEvents(events), updatedAt: safeIso(row.updatedAt || row.updated_at || updatedAt) };
}

function currentSnapshots(events: WeeklyManagementEvent[]) {
  const snapshots = new Map<string, WeeklyManagementSnapshot>();
  for (const event of events) if (event.snapshot && !snapshots.has(event.reviewId)) snapshots.set(event.reviewId, event.snapshot);
  return snapshots;
}

function latestIssueEvent(events: WeeklyManagementEvent[], reviewId: string, issue: WeeklyManagementIssue) {
  return events.find((event) => event.type === "ISSUE_UPDATED" && event.reviewId === reviewId && event.issueId === issue.id && event.issueFingerprint === issue.fingerprint) || null;
}

function latestReviewStateEvent(events: WeeklyManagementEvent[], reviewId: string) {
  return events.find((event) => event.reviewId === reviewId && ["WEEK_COMPLETED", "WEEK_REOPENED"].includes(event.type)) || null;
}

function viewForReview(snapshot: WeeklyManagementSnapshot, events: WeeklyManagementEvent[], today: string): WeeklyManagementReviewView {
  const reviewEvents = events.filter((event) => event.reviewId === snapshot.id);
  const issues = snapshot.issues.map((issue): WeeklyIssueView => {
    const latest = latestIssueEvent(reviewEvents, snapshot.id, issue);
    const status = latest?.status || "OPEN";
    const followupAt = latest?.followupAt || null;
    return {
      ...issue,
      status,
      note: latest?.note || null,
      followupAt,
      responsibleEmail: latest?.responsibleEmail || null,
      updatedAt: latest?.at || null,
      updatedBy: latest?.actorEmail || null,
      overdue: Boolean(followupAt && followupAt < today && ACTIVE_ISSUE_STATUSES.has(status)),
      hasRecordedConclusion: Boolean(latest),
    };
  });
  const stateEvent = latestReviewStateEvent(reviewEvents, snapshot.id);
  const completed = stateEvent?.type === "WEEK_COMPLETED";
  const openIssues = issues.filter((issue) => issue.status === "OPEN").length;
  const activeActions = issues.filter((issue) => ACTIVE_ISSUE_STATUSES.has(issue.status)).length;
  const overdueActions = issues.filter((issue) => issue.overdue).length;
  const notes = reviewEvents.filter((event) => event.type === "WEEK_NOTE_ADDED" && event.note).map((event) => ({ id: event.id, at: event.at, actorEmail: event.actorEmail, note: event.note! }));
  return {
    ...snapshot,
    issues,
    completed,
    completedAt: completed ? stateEvent?.at || null : null,
    completedBy: completed ? stateEvent?.actorEmail || null : null,
    completionNote: completed ? stateEvent?.note || null : null,
    lastUpdatedAt: reviewEvents[0]?.at || snapshot.capturedAt,
    openIssues,
    activeActions,
    overdueActions,
    conclusionCoverageRate: issues.length ? Math.round(((issues.length - openIssues) / issues.length) * 100) : 100,
    notes,
  };
}

export function buildWeeklyManagementJournal(settings: WeeklyManagementSettings, role: AccessRole, now = new Date()): WeeklyManagementJournal {
  const today = madridDate(now);
  const weekStart = madridWeekStart(now);
  const reviews = [...currentSnapshots(settings.events).values()]
    .filter((snapshot) => role === "OWNER" || snapshot.capturedRole === role)
    .map((snapshot) => viewForReview(snapshot, settings.events, today))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart) || b.capturedAt.localeCompare(a.capturedAt));
  const visibleIds = new Set(reviews.map((review) => review.id));
  const fourWeeksAgo = now.getTime() - 28 * 86_400_000;
  const current = reviews.find((review) => review.weekStart === weekStart && review.capturedRole === role) || null;
  return {
    generatedAt: now.toISOString(),
    role,
    currentWeekStart: weekStart,
    currentReviewId: current?.id || null,
    summary: {
      reviews: reviews.length,
      completedReviews: reviews.filter((review) => review.completed).length,
      openReviews: reviews.filter((review) => !review.completed).length,
      openIssues: reviews.reduce((sum, review) => sum + review.openIssues, 0),
      activeActions: reviews.reduce((sum, review) => sum + review.activeActions, 0),
      overdueActions: reviews.reduce((sum, review) => sum + review.overdueActions, 0),
      conclusionsLast28Days: settings.events.filter((event) => visibleIds.has(event.reviewId) && event.type === "ISSUE_UPDATED" && new Date(event.at).getTime() >= fourWeeksAgo).length,
    },
    reviews,
    safety: {
      appendOnlyHistory: true,
      serverGeneratedAnalytics: true,
      automaticTaskCreation: false,
      automaticCustomerContact: false,
      automaticPipelineChanges: false,
      journalResponsibilityIsNotAssignment: true,
    },
  };
}

export function weeklyReviewById(journal: WeeklyManagementJournal, reviewId: string) {
  return journal.reviews.find((review) => review.id === reviewId) || null;
}

export function canWriteWeeklyManagement(role: AccessRole) {
  return role !== "VIEWER";
}

export function makeWeeklyManagementEvent(input: Omit<WeeklyManagementEvent, "id" | "at"> & { id?: string; at?: string }): WeeklyManagementEvent {
  return { ...input, id: input.id || crypto.randomUUID(), at: input.at || new Date().toISOString() };
}
