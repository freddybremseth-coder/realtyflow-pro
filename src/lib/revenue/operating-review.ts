import { normalizeRole, type AccessRole } from "@/lib/access-control";
import type {
  BriefingCalendarEvent,
  ExecutiveBriefing,
  ExecutiveBriefingState,
  ExecutiveDecision,
  ExecutiveDecisionSeverity,
  ExecutiveDecisionSource,
} from "@/lib/revenue/executive-briefing";

export const OPERATING_REVIEW_SETTINGS_KEY = "operating-review:journal";
export const OPERATING_DECISION_STATUSES = [
  "OPEN",
  "ACTION_PLANNED",
  "DEFERRED",
  "ESCALATED",
  "COMPLETED",
  "NO_ACTION",
] as const;
export type OperatingDecisionStatus = (typeof OPERATING_DECISION_STATUSES)[number];

export const OPERATING_REVIEW_EVENT_TYPES = [
  "REVIEW_CAPTURED",
  "REVIEW_REFRESHED",
  "DECISION_UPDATED",
  "REVIEW_NOTE_ADDED",
  "REVIEW_COMPLETED",
  "REVIEW_REOPENED",
] as const;
export type OperatingReviewEventType = (typeof OPERATING_REVIEW_EVENT_TYPES)[number];

export interface OperatingDecisionSnapshot {
  id: string;
  fingerprint: string;
  source: ExecutiveDecisionSource;
  severity: ExecutiveDecisionSeverity;
  score: number;
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  contactId: string | null;
  ownerEmail: string | null;
  dueAt: string | null;
  amountEur: number | null;
}

export interface OperatingGoalSnapshot {
  id: string;
  label: string;
  unit: "EUR" | "COUNT";
  target: number | null;
  actual: number;
  projected: number | null;
  progressPercent: number | null;
  gap: number | null;
  status: string;
  detail: string;
}

export interface OperatingReviewSnapshot {
  id: string;
  reviewDate: string;
  revision: number;
  capturedAt: string;
  capturedBy: string;
  capturedRole: AccessRole;
  roleLabel: string;
  state: ExecutiveBriefingState;
  headline: string;
  summary: ExecutiveBriefing["summary"];
  decisions: OperatingDecisionSnapshot[];
  agenda: BriefingCalendarEvent[];
  goals: OperatingGoalSnapshot[];
  dataSources: ExecutiveBriefing["dataSources"];
  warnings: string[];
  fingerprint: string;
}

export interface OperatingReviewEvent {
  id: string;
  type: OperatingReviewEventType;
  at: string;
  actorEmail: string;
  actorRole: AccessRole;
  reviewId: string;
  reviewDate: string;
  snapshot: OperatingReviewSnapshot | null;
  decisionId: string | null;
  decisionFingerprint: string | null;
  previousStatus: OperatingDecisionStatus | null;
  status: OperatingDecisionStatus | null;
  note: string | null;
  followupAt: string | null;
  responsibleEmail: string | null;
}

export interface OperatingReviewSettings {
  version: 1;
  events: OperatingReviewEvent[];
  updatedAt: string | null;
}

export interface OperatingDecisionView extends OperatingDecisionSnapshot {
  status: OperatingDecisionStatus;
  note: string | null;
  followupAt: string | null;
  responsibleEmail: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  overdue: boolean;
  hasRecordedDecision: boolean;
}

export interface OperatingReviewView extends Omit<OperatingReviewSnapshot, "decisions"> {
  decisions: OperatingDecisionView[];
  completed: boolean;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
  lastUpdatedAt: string;
  undecided: number;
  outstandingFollowups: number;
  overdueFollowups: number;
  recordedDecisions: number;
  decisionCoveragePercent: number;
  notes: Array<{ id: string; at: string; actorEmail: string; note: string }>;
}

export interface OperatingReviewTimelineEvent {
  id: string;
  type: OperatingReviewEventType;
  at: string;
  actorEmail: string;
  actorRole: AccessRole;
  reviewId: string;
  reviewDate: string;
  reviewRole: AccessRole;
  decisionId: string | null;
  status: OperatingDecisionStatus | null;
  note: string | null;
  followupAt: string | null;
  responsibleEmail: string | null;
}

export interface OperatingReviewJournal {
  generatedAt: string;
  role: AccessRole;
  today: string;
  todayReviewId: string | null;
  summary: {
    reviews: number;
    completedReviews: number;
    openReviews: number;
    undecidedDecisions: number;
    outstandingFollowups: number;
    overdueFollowups: number;
    decisionsRecordedLast7Days: number;
  };
  reviews: OperatingReviewView[];
  recentEvents: OperatingReviewTimelineEvent[];
  safety: {
    appendOnlyHistory: true;
    serverGeneratedSnapshots: true;
    automaticCustomerContact: false;
    automaticTaskCreation: false;
    automaticCalendarChanges: false;
    automaticPipelineChanges: false;
    journalResponsibilityIsNotAssignment: true;
  };
}

const DECISION_SOURCES = new Set<ExecutiveDecisionSource>([
  "ALERTS", "SALES", "CLOSING", "FINANCE", "KEYHOLDING", "EXECUTION", "GOALS", "TEAM",
]);
const DECISION_SEVERITIES = new Set<ExecutiveDecisionSeverity>(["CRITICAL", "HIGH", "MEDIUM"]);
const REVIEW_STATES = new Set<ExecutiveBriefingState>(["CRITICAL", "ATTENTION", "ON_TRACK"]);
const DECISION_STATUS_SET = new Set<OperatingDecisionStatus>(OPERATING_DECISION_STATUSES);
const EVENT_TYPE_SET = new Set<OperatingReviewEventType>(OPERATING_REVIEW_EVENT_TYPES);
const OUTSTANDING_STATUSES = new Set<OperatingDecisionStatus>(["ACTION_PLANNED", "DEFERRED", "ESCALATED"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;
const MAX_EVENTS = 2500;
const MAX_REVIEWS = 180;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
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

function nullableString(value: unknown, max = 2000) {
  const parsed = stringValue(value, max);
  return parsed || null;
}

function emailValue(value: unknown) {
  const normalized = stringValue(value, 320).toLowerCase();
  return normalized.includes("@") ? normalized : "";
}

function safeIso(value: unknown) {
  const parsed = value ? new Date(String(value)) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

function dateOnly(value: unknown) {
  const raw = stringValue(value, 10);
  if (!DATE_PATTERN.test(raw)) return null;
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

export function madridDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
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

export function operatingReviewFingerprint(value: unknown) {
  const input = stableValue(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function snapshotDecision(decision: ExecutiveDecision): OperatingDecisionSnapshot {
  const base = {
    id: decision.id,
    source: decision.source,
    severity: decision.severity,
    score: decision.score,
    title: decision.title,
    subject: decision.subject,
    detail: decision.detail,
    recommendedAction: decision.recommendedAction,
    href: decision.href,
    contactId: decision.contactId,
    ownerEmail: decision.ownerEmail,
    dueAt: decision.dueAt,
    amountEur: decision.amountEur,
  };
  return { ...base, fingerprint: operatingReviewFingerprint(base) };
}

export function createOperatingReviewSnapshot(
  briefing: ExecutiveBriefing,
  actorEmail: string,
  now = new Date(),
  options: { reviewId?: string; revision?: number } = {},
): OperatingReviewSnapshot {
  const decisions = briefing.decisions.map(snapshotDecision);
  const reviewDate = madridDate(now);
  const base = {
    id: options.reviewId || crypto.randomUUID(),
    reviewDate,
    revision: Math.max(1, Math.floor(options.revision || 1)),
    capturedAt: now.toISOString(),
    capturedBy: actorEmail.trim().toLowerCase(),
    capturedRole: briefing.role,
    roleLabel: briefing.roleLabel,
    state: briefing.state,
    headline: briefing.headline,
    summary: { ...briefing.summary },
    decisions,
    agenda: briefing.agenda.map((event) => ({ ...event })),
    goals: briefing.goals.map((goal) => ({
      id: goal.id,
      label: goal.label,
      unit: goal.unit,
      target: goal.target,
      actual: goal.actual,
      projected: goal.projected,
      progressPercent: goal.progressPercent,
      gap: goal.gap,
      status: goal.status,
      detail: goal.detail,
    })),
    dataSources: briefing.dataSources.map((source) => ({ ...source })),
    warnings: [...briefing.warnings],
  };
  return {
    ...base,
    fingerprint: operatingReviewFingerprint({
      reviewDate: base.reviewDate,
      role: base.capturedRole,
      state: base.state,
      headline: base.headline,
      summary: base.summary,
      decisions: decisions.map((decision) => decision.fingerprint),
      agenda: base.agenda,
      goals: base.goals,
      dataSources: base.dataSources,
    }),
  };
}

function parseDecision(value: unknown): OperatingDecisionSnapshot | null {
  const row = record(value);
  const id = stringValue(row.id, 500);
  const source = stringValue(row.source, 30).toUpperCase() as ExecutiveDecisionSource;
  const severity = stringValue(row.severity, 20).toUpperCase() as ExecutiveDecisionSeverity;
  if (!ID_PATTERN.test(id) || !DECISION_SOURCES.has(source) || !DECISION_SEVERITIES.has(severity)) return null;
  const base = {
    id,
    source,
    severity,
    score: numberValue(row.score),
    title: stringValue(row.title, 300),
    subject: stringValue(row.subject, 500),
    detail: stringValue(row.detail, 2000),
    recommendedAction: stringValue(row.recommendedAction || row.recommended_action, 2000),
    href: stringValue(row.href, 1000) || "/executive-briefing",
    contactId: nullableString(row.contactId || row.contact_id, 500),
    ownerEmail: emailValue(row.ownerEmail || row.owner_email) || null,
    dueAt: safeIso(row.dueAt || row.due_at),
    amountEur: nullableNumber(row.amountEur ?? row.amount_eur),
  };
  return {
    ...base,
    fingerprint: stringValue(row.fingerprint, 64).toLowerCase() || operatingReviewFingerprint(base),
  };
}

function parseCalendarEvent(value: unknown): BriefingCalendarEvent | null {
  const row = record(value);
  const id = stringValue(row.id, 1000);
  const start = stringValue(row.start, 100);
  if (!id || !start) return null;
  return {
    id,
    title: stringValue(row.title, 500) || "(Uten tittel)",
    start,
    end: nullableString(row.end, 100),
    allDay: Boolean(row.allDay ?? row.all_day),
    location: nullableString(row.location, 500),
    href: nullableString(row.href, 2000),
  };
}

function parseGoal(value: unknown): OperatingGoalSnapshot | null {
  const row = record(value);
  const id = stringValue(row.id, 100);
  const unit = stringValue(row.unit, 20).toUpperCase();
  if (!id || !["EUR", "COUNT"].includes(unit)) return null;
  return {
    id,
    label: stringValue(row.label, 300),
    unit: unit as OperatingGoalSnapshot["unit"],
    target: nullableNumber(row.target),
    actual: numberValue(row.actual),
    projected: nullableNumber(row.projected),
    progressPercent: nullableNumber(row.progressPercent ?? row.progress_percent),
    gap: nullableNumber(row.gap),
    status: stringValue(row.status, 50).toUpperCase(),
    detail: stringValue(row.detail, 1000),
  };
}

function parseSummary(value: unknown): ExecutiveBriefing["summary"] {
  const row = record(value);
  return {
    activeAlerts: numberValue(row.activeAlerts ?? row.active_alerts),
    criticalAlerts: numberValue(row.criticalAlerts ?? row.critical_alerts),
    decisionsToday: numberValue(row.decisionsToday ?? row.decisions_today),
    overdueExecution: numberValue(row.overdueExecution ?? row.overdue_execution),
    calendarToday: numberValue(row.calendarToday ?? row.calendar_today),
    highRiskClosings: nullableNumber(row.highRiskClosings ?? row.high_risk_closings),
    overdueCommission: nullableNumber(row.overdueCommission ?? row.overdue_commission),
    keyholdingRenewals: nullableNumber(row.keyholdingRenewals ?? row.keyholding_renewals),
    goalsBehind: numberValue(row.goalsBehind ?? row.goals_behind),
    unassignedPriorityWork: numberValue(row.unassignedPriorityWork ?? row.unassigned_priority_work),
  };
}

function parseSnapshot(value: unknown): OperatingReviewSnapshot | null {
  const row = record(value);
  const id = stringValue(row.id, 500);
  const reviewDate = dateOnly(row.reviewDate || row.review_date);
  const capturedAt = safeIso(row.capturedAt || row.captured_at);
  const capturedBy = emailValue(row.capturedBy || row.captured_by);
  const capturedRole = normalizeRole(row.capturedRole || row.captured_role);
  const state = stringValue(row.state, 30).toUpperCase() as ExecutiveBriefingState;
  if (!ID_PATTERN.test(id) || !reviewDate || !capturedAt || !capturedBy || !capturedRole || !REVIEW_STATES.has(state)) return null;
  const decisions = (Array.isArray(row.decisions) ? row.decisions : []).map(parseDecision).filter(Boolean) as OperatingDecisionSnapshot[];
  const agenda = (Array.isArray(row.agenda) ? row.agenda : []).map(parseCalendarEvent).filter(Boolean) as BriefingCalendarEvent[];
  const goals = (Array.isArray(row.goals) ? row.goals : []).map(parseGoal).filter(Boolean) as OperatingGoalSnapshot[];
  const dataSources = (Array.isArray(row.dataSources || row.data_sources) ? row.dataSources || row.data_sources : [])
    .flatMap((value): ExecutiveBriefing["dataSources"] => {
      const source = record(value);
      const sourceId = stringValue(source.id, 100);
      if (!sourceId) return [];
      return [{
        id: sourceId,
        label: stringValue(source.label, 300),
        available: Boolean(source.available),
        generatedAt: safeIso(source.generatedAt || source.generated_at),
        warning: nullableString(source.warning, 1000),
      }];
    });
  const base = {
    id,
    reviewDate,
    revision: Math.max(1, Math.floor(numberValue(row.revision, 1))),
    capturedAt,
    capturedBy,
    capturedRole,
    roleLabel: stringValue(row.roleLabel || row.role_label, 100) || capturedRole,
    state,
    headline: stringValue(row.headline, 1000),
    summary: parseSummary(row.summary),
    decisions,
    agenda,
    goals,
    dataSources,
    warnings: (Array.isArray(row.warnings) ? row.warnings : []).map((item) => stringValue(item, 1000)).filter(Boolean).slice(0, 100),
  };
  return {
    ...base,
    fingerprint: stringValue(row.fingerprint, 64).toLowerCase() || operatingReviewFingerprint(base),
  };
}

function parseEvent(value: unknown): OperatingReviewEvent | null {
  const row = record(value);
  const id = stringValue(row.id, 500);
  const type = stringValue(row.type, 50).toUpperCase() as OperatingReviewEventType;
  const at = safeIso(row.at || row.created_at);
  const actorEmail = emailValue(row.actorEmail || row.actor_email);
  const actorRole = normalizeRole(row.actorRole || row.actor_role);
  const reviewId = stringValue(row.reviewId || row.review_id, 500);
  const reviewDate = dateOnly(row.reviewDate || row.review_date);
  if (!ID_PATTERN.test(id) || !EVENT_TYPE_SET.has(type) || !at || !actorEmail || !actorRole || !ID_PATTERN.test(reviewId) || !reviewDate) return null;
  const statusRaw = stringValue(row.status, 50).toUpperCase() as OperatingDecisionStatus;
  const previousRaw = stringValue(row.previousStatus || row.previous_status, 50).toUpperCase() as OperatingDecisionStatus;
  const snapshot = parseSnapshot(row.snapshot);
  if (["REVIEW_CAPTURED", "REVIEW_REFRESHED"].includes(type) && (!snapshot || snapshot.id !== reviewId)) return null;
  const decisionId = nullableString(row.decisionId || row.decision_id, 500);
  const decisionFingerprint = nullableString(row.decisionFingerprint || row.decision_fingerprint, 64)?.toLowerCase() || null;
  if (type === "DECISION_UPDATED" && (!decisionId || !decisionFingerprint || !DECISION_STATUS_SET.has(statusRaw))) return null;
  return {
    id,
    type,
    at,
    actorEmail,
    actorRole,
    reviewId,
    reviewDate,
    snapshot,
    decisionId,
    decisionFingerprint,
    previousStatus: DECISION_STATUS_SET.has(previousRaw) ? previousRaw : null,
    status: DECISION_STATUS_SET.has(statusRaw) ? statusRaw : null,
    note: nullableString(row.note, 1000),
    followupAt: dateOnly(row.followupAt || row.followup_at),
    responsibleEmail: emailValue(row.responsibleEmail || row.responsible_email) || null,
  };
}

export function parseOperatingReviewSettings(value: unknown, updatedAt?: unknown): OperatingReviewSettings {
  const row = record(value);
  const events = (Array.isArray(row.events) ? row.events : [])
    .map(parseEvent)
    .filter(Boolean)
    .sort((a, b) => b!.at.localeCompare(a!.at)) as OperatingReviewEvent[];
  return {
    version: 1,
    events: compactOperatingReviewEvents(events),
    updatedAt: safeIso(row.updatedAt || row.updated_at || updatedAt),
  };
}

export function compactOperatingReviewEvents(events: OperatingReviewEvent[]) {
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

function currentSnapshots(events: OperatingReviewEvent[]) {
  const snapshots = new Map<string, OperatingReviewSnapshot>();
  for (const event of events) {
    if (event.snapshot && !snapshots.has(event.reviewId)) snapshots.set(event.reviewId, event.snapshot);
  }
  return snapshots;
}

function canSeeReview(role: AccessRole, snapshot: OperatingReviewSnapshot) {
  return role === "OWNER" || snapshot.capturedRole === role;
}

function latestDecisionEvent(events: OperatingReviewEvent[], reviewId: string, decision: OperatingDecisionSnapshot) {
  return events.find((event) => (
    event.type === "DECISION_UPDATED" &&
    event.reviewId === reviewId &&
    event.decisionId === decision.id &&
    event.decisionFingerprint === decision.fingerprint
  )) || null;
}

function latestReviewStateEvent(events: OperatingReviewEvent[], reviewId: string) {
  return events.find((event) => event.reviewId === reviewId && ["REVIEW_COMPLETED", "REVIEW_REOPENED"].includes(event.type)) || null;
}

function viewForReview(snapshot: OperatingReviewSnapshot, events: OperatingReviewEvent[], today: string): OperatingReviewView {
  const reviewEvents = events.filter((event) => event.reviewId === snapshot.id);
  const decisions = snapshot.decisions.map((decision): OperatingDecisionView => {
    const latest = latestDecisionEvent(reviewEvents, snapshot.id, decision);
    const status = latest?.status || "OPEN";
    const followupAt = latest?.followupAt || null;
    return {
      ...decision,
      status,
      note: latest?.note || null,
      followupAt,
      responsibleEmail: latest?.responsibleEmail || null,
      updatedAt: latest?.at || null,
      updatedBy: latest?.actorEmail || null,
      overdue: Boolean(followupAt && followupAt < today && OUTSTANDING_STATUSES.has(status)),
      hasRecordedDecision: Boolean(latest),
    };
  });
  const reviewState = latestReviewStateEvent(reviewEvents, snapshot.id);
  const completed = reviewState?.type === "REVIEW_COMPLETED";
  const notes = reviewEvents
    .filter((event) => event.type === "REVIEW_NOTE_ADDED" && event.note)
    .map((event) => ({ id: event.id, at: event.at, actorEmail: event.actorEmail, note: event.note! }));
  const undecided = decisions.filter((decision) => decision.status === "OPEN").length;
  const outstandingFollowups = decisions.filter((decision) => OUTSTANDING_STATUSES.has(decision.status)).length;
  const overdueFollowups = decisions.filter((decision) => decision.overdue).length;
  const recordedDecisions = decisions.length - undecided;
  return {
    ...snapshot,
    decisions,
    completed,
    completedAt: completed ? reviewState?.at || null : null,
    completedBy: completed ? reviewState?.actorEmail || null : null,
    completionNote: completed ? reviewState?.note || null : null,
    lastUpdatedAt: reviewEvents[0]?.at || snapshot.capturedAt,
    undecided,
    outstandingFollowups,
    overdueFollowups,
    recordedDecisions,
    decisionCoveragePercent: decisions.length ? Math.round((recordedDecisions / decisions.length) * 100) : 100,
    notes,
  };
}

export function buildOperatingReviewJournal(
  settings: OperatingReviewSettings,
  role: AccessRole,
  now = new Date(),
): OperatingReviewJournal {
  const today = madridDate(now);
  const snapshots = currentSnapshots(settings.events);
  const visibleSnapshots = [...snapshots.values()].filter((snapshot) => canSeeReview(role, snapshot));
  const reviews = visibleSnapshots
    .map((snapshot) => viewForReview(snapshot, settings.events, today))
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate) || b.capturedAt.localeCompare(a.capturedAt));
  const visibleIds = new Set(reviews.map((review) => review.id));
  const reviewRole = new Map(reviews.map((review) => [review.id, review.capturedRole]));
  const sevenDaysAgo = now.getTime() - 7 * 86_400_000;
  const recentEvents = settings.events
    .filter((event) => visibleIds.has(event.reviewId))
    .slice(0, 100)
    .map((event): OperatingReviewTimelineEvent => ({
      id: event.id,
      type: event.type,
      at: event.at,
      actorEmail: event.actorEmail,
      actorRole: event.actorRole,
      reviewId: event.reviewId,
      reviewDate: event.reviewDate,
      reviewRole: reviewRole.get(event.reviewId) || event.actorRole,
      decisionId: event.decisionId,
      status: event.status,
      note: event.note,
      followupAt: event.followupAt,
      responsibleEmail: event.responsibleEmail,
    }));
  const todayReview = reviews.find((review) => review.reviewDate === today && review.capturedRole === role) || null;
  return {
    generatedAt: now.toISOString(),
    role,
    today,
    todayReviewId: todayReview?.id || null,
    summary: {
      reviews: reviews.length,
      completedReviews: reviews.filter((review) => review.completed).length,
      openReviews: reviews.filter((review) => !review.completed).length,
      undecidedDecisions: reviews.reduce((sum, review) => sum + review.undecided, 0),
      outstandingFollowups: reviews.reduce((sum, review) => sum + review.outstandingFollowups, 0),
      overdueFollowups: reviews.reduce((sum, review) => sum + review.overdueFollowups, 0),
      decisionsRecordedLast7Days: settings.events.filter((event) => (
        visibleIds.has(event.reviewId) &&
        event.type === "DECISION_UPDATED" &&
        new Date(event.at).getTime() >= sevenDaysAgo
      )).length,
    },
    reviews,
    recentEvents,
    safety: {
      appendOnlyHistory: true,
      serverGeneratedSnapshots: true,
      automaticCustomerContact: false,
      automaticTaskCreation: false,
      automaticCalendarChanges: false,
      automaticPipelineChanges: false,
      journalResponsibilityIsNotAssignment: true,
    },
  };
}

export function reviewById(journal: OperatingReviewJournal, reviewId: string) {
  return journal.reviews.find((review) => review.id === reviewId) || null;
}

export function canWriteOperatingReview(role: AccessRole) {
  return role !== "VIEWER";
}

export function makeOperatingReviewEvent(input: Omit<OperatingReviewEvent, "id" | "at"> & { id?: string; at?: string }): OperatingReviewEvent {
  const at = input.at || new Date().toISOString();
  return {
    ...input,
    id: input.id || crypto.randomUUID(),
    at,
  };
}
