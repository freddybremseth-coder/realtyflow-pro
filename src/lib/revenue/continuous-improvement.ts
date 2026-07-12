import { normalizeRole, type AccessRole } from "@/lib/access-control";
import { operatingReviewFingerprint } from "@/lib/revenue/operating-review";
import {
  buildWeeklyManagementJournal,
  type WeeklyIssueType,
  type WeeklyManagementIssue,
  type WeeklyManagementSettings,
} from "@/lib/revenue/weekly-management-review";
import type { ExecutiveDecisionSeverity, ExecutiveDecisionSource } from "@/lib/revenue/executive-briefing";

export const CONTINUOUS_IMPROVEMENT_SETTINGS_KEY = "continuous-improvement:register";

export const IMPROVEMENT_STATUSES = [
  "OPEN",
  "DIAGNOSING",
  "ACTION_PLANNED",
  "IN_PROGRESS",
  "VERIFYING",
  "EFFECTIVE",
  "INEFFECTIVE",
  "ACCEPTED_RISK",
] as const;
export type ImprovementStatus = (typeof IMPROVEMENT_STATUSES)[number];

export const ROOT_CAUSE_CATEGORIES = [
  "UNKNOWN",
  "PROCESS",
  "CAPACITY",
  "OWNERSHIP",
  "DATA_QUALITY",
  "SYSTEM_TOOLING",
  "DEPENDENCY",
  "DECISION_AUTHORITY",
  "SKILL_KNOWLEDGE",
  "EXTERNAL",
] as const;
export type RootCauseCategory = (typeof ROOT_CAUSE_CATEGORIES)[number];

export const IMPROVEMENT_ACTION_TYPES = [
  "UNSET",
  "STANDARDIZE_PROCESS",
  "CLARIFY_OWNERSHIP",
  "IMPROVE_DATA",
  "AUTOMATE_SAFELY",
  "TRAINING",
  "CAPACITY_CHANGE",
  "ESCALATE_DEPENDENCY",
  "OTHER",
] as const;
export type ImprovementActionType = (typeof IMPROVEMENT_ACTION_TYPES)[number];

export const IMPROVEMENT_EVENT_TYPES = [
  "IMPROVEMENT_CREATED",
  "IMPROVEMENT_UPDATED",
  "IMPROVEMENT_NOTE_ADDED",
  "IMPROVEMENT_CLOSED",
  "IMPROVEMENT_REOPENED",
] as const;
export type ImprovementEventType = (typeof IMPROVEMENT_EVENT_TYPES)[number];

export type ImprovementEffectTrend = "NOT_ENOUGH_DATA" | "IMPROVING" | "UNCHANGED" | "WORSENING" | "RESOLVED";

export interface ImprovementBaseline {
  firstWeek: string;
  lastWeek: string;
  observedWeeks: number;
  occurrenceWeeks: number;
  totalOccurrences: number;
  overdueInstances: number;
  repeatedDeferrals: number;
  maximumDaysOpen: number | null;
  occurrenceRate: number | null;
}

export interface ImprovementCandidate {
  id: string;
  role: AccessRole;
  source: ExecutiveDecisionSource | "MANAGEMENT";
  issueType: WeeklyIssueType;
  severity: ExecutiveDecisionSeverity;
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  decisionKey: string | null;
  firstWeek: string;
  lastWeek: string;
  observedWeeks: number;
  occurrenceWeeks: number;
  totalOccurrences: number;
  overdueInstances: number;
  repeatedDeferrals: number;
  maximumDaysOpen: number | null;
  amountEur: number | null;
  occurrenceRate: number | null;
  fingerprint: string;
  existingImprovementId: string | null;
}

export interface ImprovementSnapshot {
  id: string;
  candidateId: string;
  role: AccessRole;
  source: ImprovementCandidate["source"];
  issueType: WeeklyIssueType;
  severity: ExecutiveDecisionSeverity;
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  decisionKey: string | null;
  createdAt: string;
  createdBy: string;
  baseline: ImprovementBaseline;
  candidateFingerprint: string;
  fingerprint: string;
}

export interface ImprovementEvent {
  id: string;
  type: ImprovementEventType;
  at: string;
  actorEmail: string;
  actorRole: AccessRole;
  improvementId: string;
  snapshot: ImprovementSnapshot | null;
  previousStatus: ImprovementStatus | null;
  status: ImprovementStatus | null;
  rootCauseCategory: RootCauseCategory | null;
  rootCauseStatement: string | null;
  actionType: ImprovementActionType | null;
  actionPlan: string | null;
  dueAt: string | null;
  ownerEmail: string | null;
  successMetric: string | null;
  targetValue: string | null;
  note: string | null;
}

export interface ContinuousImprovementSettings {
  version: 1;
  events: ImprovementEvent[];
  updatedAt: string | null;
}

export interface ImprovementEffectEvidence {
  trend: ImprovementEffectTrend;
  baselineRate: number | null;
  postRate: number | null;
  postObservedWeeks: number;
  postOccurrenceWeeks: number;
  consecutiveAbsentWeeks: number;
  latestOccurrenceWeek: string | null;
  detail: string;
}

export interface ImprovementView extends ImprovementSnapshot {
  status: ImprovementStatus;
  rootCauseCategory: RootCauseCategory;
  rootCauseStatement: string | null;
  actionType: ImprovementActionType;
  actionPlan: string | null;
  dueAt: string | null;
  ownerEmail: string | null;
  successMetric: string | null;
  targetValue: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  closed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  overdue: boolean;
  notes: Array<{ id: string; at: string; actorEmail: string; note: string }>;
  effect: ImprovementEffectEvidence;
}

export interface ContinuousImprovementRegister {
  generatedAt: string;
  role: AccessRole;
  summary: {
    improvements: number;
    active: number;
    overdue: number;
    verifying: number;
    effective: number;
    ineffective: number;
    suggestedCandidates: number;
  };
  candidates: ImprovementCandidate[];
  improvements: ImprovementView[];
  warnings: string[];
  safety: {
    appendOnlyHistory: true;
    serverGeneratedEvidence: true;
    automaticTaskCreation: false;
    automaticCustomerContact: false;
    automaticPipelineChanges: false;
    improvementOwnerIsNotAssignment: true;
    measuredTrendIsNotCausality: true;
  };
}

type CandidateGroup = {
  key: string;
  role: AccessRole;
  source: ImprovementCandidate["source"];
  issueType: WeeklyIssueType;
  severity: ExecutiveDecisionSeverity;
  title: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  href: string;
  decisionKey: string | null;
  firstWeek: string;
  lastWeek: string;
  weeks: Set<string>;
  totalOccurrences: number;
  overdueInstances: number;
  repeatedDeferrals: number;
  maximumDaysOpen: number | null;
  amountEur: number | null;
};

const STATUS_SET = new Set<ImprovementStatus>(IMPROVEMENT_STATUSES);
const ROOT_CAUSE_SET = new Set<RootCauseCategory>(ROOT_CAUSE_CATEGORIES);
const ACTION_TYPE_SET = new Set<ImprovementActionType>(IMPROVEMENT_ACTION_TYPES);
const EVENT_TYPE_SET = new Set<ImprovementEventType>(IMPROVEMENT_EVENT_TYPES);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[a-zA-Z0-9:_@.%-]{1,500}$/;
const MAX_EVENTS = 2500;
const MAX_IMPROVEMENTS = 240;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function emailValue(value: unknown) {
  const normalized = clean(value, 320).toLowerCase();
  return normalized.includes("@") ? normalized : "";
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

function severityRank(value: ExecutiveDecisionSeverity) {
  return value === "CRITICAL" ? 3 : value === "HIGH" ? 2 : 1;
}

function normalizeSubject(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "unknown";
}

export function improvementCandidateKey(role: AccessRole, issue: Pick<WeeklyManagementIssue, "type" | "source" | "decisionKey" | "subject">) {
  if (issue.decisionKey) return `${role}:${issue.type}:${issue.decisionKey}`;
  if (issue.type === "SOURCE_BOTTLENECK") return `${role}:${issue.type}:${issue.source}`;
  if (issue.type === "REVIEW_DISCIPLINE") return `${role}:${issue.type}`;
  return `${role}:${issue.type}:${issue.source}:${normalizeSubject(issue.subject)}`;
}

function currentSnapshots(events: ImprovementEvent[]) {
  const snapshots = new Map<string, ImprovementSnapshot>();
  for (const event of events) if (event.snapshot && !snapshots.has(event.improvementId)) snapshots.set(event.improvementId, event.snapshot);
  return snapshots;
}

function visibleWeeklyReviews(weeklySettings: WeeklyManagementSettings, role: AccessRole, now: Date) {
  return buildWeeklyManagementJournal(weeklySettings, role, now).reviews;
}

function candidateGroups(weeklySettings: WeeklyManagementSettings, role: AccessRole, now: Date) {
  const reviews = visibleWeeklyReviews(weeklySettings, role, now);
  const observedWeeksByRole = new Map<AccessRole, Set<string>>();
  const groups = new Map<string, CandidateGroup>();

  for (const review of reviews) {
    const roleWeeks = observedWeeksByRole.get(review.capturedRole) || new Set<string>();
    roleWeeks.add(review.weekStart);
    observedWeeksByRole.set(review.capturedRole, roleWeeks);
    for (const issue of review.issues) {
      const key = improvementCandidateKey(review.capturedRole, issue);
      const existing = groups.get(key);
      const base: CandidateGroup = existing || {
        key,
        role: review.capturedRole,
        source: issue.source,
        issueType: issue.type,
        severity: issue.severity,
        title: issue.title,
        subject: issue.subject,
        detail: issue.detail,
        recommendedAction: issue.recommendedAction,
        href: issue.href,
        decisionKey: issue.decisionKey,
        firstWeek: review.weekStart,
        lastWeek: review.weekStart,
        weeks: new Set<string>(),
        totalOccurrences: 0,
        overdueInstances: 0,
        repeatedDeferrals: 0,
        maximumDaysOpen: null,
        amountEur: issue.amountEur,
      };
      base.weeks.add(review.weekStart);
      base.totalOccurrences += 1;
      if (issue.overdue || issue.type === "OVERDUE_FOLLOWUP") base.overdueInstances += 1;
      base.repeatedDeferrals += issue.deferrals;
      if (issue.daysOpen !== null) base.maximumDaysOpen = Math.max(base.maximumDaysOpen || 0, issue.daysOpen);
      base.firstWeek = base.firstWeek < review.weekStart ? base.firstWeek : review.weekStart;
      if (review.weekStart >= base.lastWeek) {
        base.lastWeek = review.weekStart;
        base.title = issue.title;
        base.subject = issue.subject;
        base.detail = issue.detail;
        base.recommendedAction = issue.recommendedAction;
        base.href = issue.href;
        base.amountEur = issue.amountEur;
      }
      if (severityRank(issue.severity) > severityRank(base.severity)) base.severity = issue.severity;
      groups.set(key, base);
    }
  }
  return { groups: [...groups.values()], observedWeeksByRole, reviews };
}

function qualifies(group: CandidateGroup) {
  return group.weeks.size >= 2 || group.repeatedDeferrals >= 3 || (group.issueType === "OVERDUE_FOLLOWUP" && (group.maximumDaysOpen || 0) >= 14) || group.issueType === "SOURCE_BOTTLENECK";
}

function candidateFromGroup(group: CandidateGroup, observedWeeks: Set<string>, existingImprovementId: string | null): ImprovementCandidate {
  const observed = [...observedWeeks].filter((week) => week >= group.firstWeek && week <= group.lastWeek).length || group.weeks.size;
  const base = {
    role: group.role,
    source: group.source,
    issueType: group.issueType,
    severity: group.severity,
    title: group.title,
    subject: group.subject,
    detail: group.detail,
    recommendedAction: group.recommendedAction,
    href: group.href,
    decisionKey: group.decisionKey,
    firstWeek: group.firstWeek,
    lastWeek: group.lastWeek,
    observedWeeks: observed,
    occurrenceWeeks: group.weeks.size,
    totalOccurrences: group.totalOccurrences,
    overdueInstances: group.overdueInstances,
    repeatedDeferrals: group.repeatedDeferrals,
    maximumDaysOpen: group.maximumDaysOpen,
    amountEur: group.amountEur,
    occurrenceRate: observed ? Math.round((group.weeks.size / observed) * 100) : null,
  };
  return {
    id: group.key,
    ...base,
    fingerprint: operatingReviewFingerprint(base),
    existingImprovementId,
  };
}

export function buildImprovementCandidates(weeklySettings: WeeklyManagementSettings, role: AccessRole, now = new Date(), settings?: ContinuousImprovementSettings) {
  const analysis = candidateGroups(weeklySettings, role, now);
  const tracked = new Map<string, string>();
  if (settings) for (const snapshot of currentSnapshots(settings.events).values()) tracked.set(snapshot.candidateId, snapshot.id);
  return analysis.groups
    .filter(qualifies)
    .map((group) => candidateFromGroup(group, analysis.observedWeeksByRole.get(group.role) || new Set(), tracked.get(group.key) || null))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.occurrenceWeeks - a.occurrenceWeeks || b.repeatedDeferrals - a.repeatedDeferrals || a.subject.localeCompare(b.subject));
}

export function createImprovementSnapshot(candidate: ImprovementCandidate, actorEmail: string, now = new Date(), id = crypto.randomUUID()): ImprovementSnapshot {
  const baseline: ImprovementBaseline = {
    firstWeek: candidate.firstWeek,
    lastWeek: candidate.lastWeek,
    observedWeeks: candidate.observedWeeks,
    occurrenceWeeks: candidate.occurrenceWeeks,
    totalOccurrences: candidate.totalOccurrences,
    overdueInstances: candidate.overdueInstances,
    repeatedDeferrals: candidate.repeatedDeferrals,
    maximumDaysOpen: candidate.maximumDaysOpen,
    occurrenceRate: candidate.occurrenceRate,
  };
  const base = {
    id,
    candidateId: candidate.id,
    role: candidate.role,
    source: candidate.source,
    issueType: candidate.issueType,
    severity: candidate.severity,
    title: candidate.title,
    subject: candidate.subject,
    detail: candidate.detail,
    recommendedAction: candidate.recommendedAction,
    href: candidate.href,
    decisionKey: candidate.decisionKey,
    createdAt: now.toISOString(),
    createdBy: actorEmail.trim().toLowerCase(),
    baseline,
    candidateFingerprint: candidate.fingerprint,
  };
  return { ...base, fingerprint: operatingReviewFingerprint(base) };
}

function parseBaseline(value: unknown): ImprovementBaseline {
  const row = record(value);
  return {
    firstWeek: dateOnly(row.firstWeek || row.first_week) || "1970-01-01",
    lastWeek: dateOnly(row.lastWeek || row.last_week) || "1970-01-01",
    observedWeeks: numberValue(row.observedWeeks ?? row.observed_weeks),
    occurrenceWeeks: numberValue(row.occurrenceWeeks ?? row.occurrence_weeks),
    totalOccurrences: numberValue(row.totalOccurrences ?? row.total_occurrences),
    overdueInstances: numberValue(row.overdueInstances ?? row.overdue_instances),
    repeatedDeferrals: numberValue(row.repeatedDeferrals ?? row.repeated_deferrals),
    maximumDaysOpen: nullableNumber(row.maximumDaysOpen ?? row.maximum_days_open),
    occurrenceRate: nullableNumber(row.occurrenceRate ?? row.occurrence_rate),
  };
}

function parseSnapshot(value: unknown): ImprovementSnapshot | null {
  const row = record(value);
  const id = clean(row.id, 500);
  const candidateId = clean(row.candidateId || row.candidate_id, 500);
  const role = normalizeRole(row.role);
  const source = clean(row.source, 30).toUpperCase() as ImprovementSnapshot["source"];
  const issueType = clean(row.issueType || row.issue_type, 50).toUpperCase() as WeeklyIssueType;
  const severity = clean(row.severity, 20).toUpperCase() as ExecutiveDecisionSeverity;
  const createdAt = safeIso(row.createdAt || row.created_at);
  const createdBy = emailValue(row.createdBy || row.created_by);
  if (!ID_PATTERN.test(id) || !candidateId || !role || !createdAt || !createdBy) return null;
  if (!["CRITICAL", "HIGH", "MEDIUM"].includes(severity)) return null;
  const base = {
    id,
    candidateId,
    role,
    source,
    issueType,
    severity,
    title: clean(row.title, 300),
    subject: clean(row.subject, 500),
    detail: clean(row.detail, 2000),
    recommendedAction: clean(row.recommendedAction || row.recommended_action, 2000),
    href: clean(row.href, 1000) || "/weekly-management-review",
    decisionKey: clean(row.decisionKey || row.decision_key, 500) || null,
    createdAt,
    createdBy,
    baseline: parseBaseline(row.baseline),
    candidateFingerprint: clean(row.candidateFingerprint || row.candidate_fingerprint, 64),
  };
  return { ...base, fingerprint: clean(row.fingerprint, 64) || operatingReviewFingerprint(base) };
}

function parseEvent(value: unknown): ImprovementEvent | null {
  const row = record(value);
  const id = clean(row.id, 500);
  const type = clean(row.type, 50).toUpperCase() as ImprovementEventType;
  const at = safeIso(row.at || row.created_at);
  const actorEmail = emailValue(row.actorEmail || row.actor_email);
  const actorRole = normalizeRole(row.actorRole || row.actor_role);
  const improvementId = clean(row.improvementId || row.improvement_id, 500);
  if (!ID_PATTERN.test(id) || !EVENT_TYPE_SET.has(type) || !at || !actorEmail || !actorRole || !ID_PATTERN.test(improvementId)) return null;
  const snapshot = parseSnapshot(row.snapshot);
  if (type === "IMPROVEMENT_CREATED" && (!snapshot || snapshot.id !== improvementId)) return null;
  const statusRaw = clean(row.status, 50).toUpperCase() as ImprovementStatus;
  const previousRaw = clean(row.previousStatus || row.previous_status, 50).toUpperCase() as ImprovementStatus;
  const rootCauseRaw = clean(row.rootCauseCategory || row.root_cause_category, 50).toUpperCase() as RootCauseCategory;
  const actionTypeRaw = clean(row.actionType || row.action_type, 50).toUpperCase() as ImprovementActionType;
  return {
    id,
    type,
    at,
    actorEmail,
    actorRole,
    improvementId,
    snapshot,
    previousStatus: STATUS_SET.has(previousRaw) ? previousRaw : null,
    status: STATUS_SET.has(statusRaw) ? statusRaw : null,
    rootCauseCategory: ROOT_CAUSE_SET.has(rootCauseRaw) ? rootCauseRaw : null,
    rootCauseStatement: clean(row.rootCauseStatement || row.root_cause_statement, 1500) || null,
    actionType: ACTION_TYPE_SET.has(actionTypeRaw) ? actionTypeRaw : null,
    actionPlan: clean(row.actionPlan || row.action_plan, 2000) || null,
    dueAt: dateOnly(row.dueAt || row.due_at),
    ownerEmail: emailValue(row.ownerEmail || row.owner_email) || null,
    successMetric: clean(row.successMetric || row.success_metric, 500) || null,
    targetValue: clean(row.targetValue || row.target_value, 300) || null,
    note: clean(row.note, 1000) || null,
  };
}

export function compactContinuousImprovementEvents(events: ImprovementEvent[]) {
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  const ids: string[] = [];
  for (const event of sorted) {
    if (!event.snapshot || ids.includes(event.improvementId)) continue;
    ids.push(event.improvementId);
    if (ids.length >= MAX_IMPROVEMENTS) break;
  }
  const keep = new Set(ids);
  return sorted.filter((event) => keep.has(event.improvementId)).slice(0, MAX_EVENTS);
}

export function parseContinuousImprovementSettings(value: unknown, updatedAt?: unknown): ContinuousImprovementSettings {
  const row = record(value);
  const events = (Array.isArray(row.events) ? row.events : []).map(parseEvent).filter(Boolean) as ImprovementEvent[];
  return { version: 1, events: compactContinuousImprovementEvents(events), updatedAt: safeIso(row.updatedAt || row.updated_at || updatedAt) };
}

function effectEvidence(snapshot: ImprovementSnapshot, weeklySettings: WeeklyManagementSettings, now: Date): ImprovementEffectEvidence {
  const analysis = candidateGroups(weeklySettings, snapshot.role, now);
  const roleWeeks = [...(analysis.observedWeeksByRole.get(snapshot.role) || new Set())].filter((week) => week > snapshot.baseline.lastWeek).sort();
  const group = analysis.groups.find((item) => item.key === snapshot.candidateId);
  const occurrenceWeeks = group ? [...group.weeks].filter((week) => week > snapshot.baseline.lastWeek) : [];
  const occurrenceSet = new Set(occurrenceWeeks);
  let consecutiveAbsentWeeks = 0;
  for (const week of [...roleWeeks].sort().reverse()) {
    if (occurrenceSet.has(week)) break;
    consecutiveAbsentWeeks += 1;
  }
  const postRate = roleWeeks.length ? Math.round((occurrenceWeeks.length / roleWeeks.length) * 100) : null;
  const baselineRate = snapshot.baseline.occurrenceRate;
  let trend: ImprovementEffectTrend = "NOT_ENOUGH_DATA";
  if (roleWeeks.length >= 2) {
    if (consecutiveAbsentWeeks >= 2) trend = "RESOLVED";
    else if (baselineRate !== null && postRate !== null && postRate <= baselineRate - 25) trend = "IMPROVING";
    else if (baselineRate !== null && postRate !== null && postRate >= baselineRate + 25) trend = "WORSENING";
    else trend = "UNCHANGED";
  }
  const detail = trend === "NOT_ENOUGH_DATA"
    ? `Trenger minst 2 nye ukesgjennomganger etter baseline; ${roleWeeks.length} finnes.`
    : trend === "RESOLVED"
      ? `Flaskehalsen har ikke vært registrert i de siste ${consecutiveAbsentWeeks} observerte ukene.`
      : `Forekomstrate etter baseline er ${postRate ?? 0}% mot ${baselineRate ?? 0}% i baseline.`;
  return {
    trend,
    baselineRate,
    postRate,
    postObservedWeeks: roleWeeks.length,
    postOccurrenceWeeks: occurrenceWeeks.length,
    consecutiveAbsentWeeks,
    latestOccurrenceWeek: occurrenceWeeks.sort().at(-1) || null,
    detail,
  };
}

function latestStateEvent(events: ImprovementEvent[], improvementId: string) {
  return events.find((event) => event.improvementId === improvementId && ["IMPROVEMENT_CLOSED", "IMPROVEMENT_REOPENED"].includes(event.type)) || null;
}

function latestUpdateEvent(events: ImprovementEvent[], improvementId: string) {
  return events.find((event) => event.improvementId === improvementId && event.type === "IMPROVEMENT_UPDATED") || null;
}

function viewForImprovement(snapshot: ImprovementSnapshot, events: ImprovementEvent[], weeklySettings: WeeklyManagementSettings, today: string, now: Date): ImprovementView {
  const scoped = events.filter((event) => event.improvementId === snapshot.id);
  const latest = latestUpdateEvent(scoped, snapshot.id);
  const state = latestStateEvent(scoped, snapshot.id);
  const closed = state?.type === "IMPROVEMENT_CLOSED";
  const status = latest?.status || "OPEN";
  const dueAt = latest?.dueAt || null;
  return {
    ...snapshot,
    status,
    rootCauseCategory: latest?.rootCauseCategory || "UNKNOWN",
    rootCauseStatement: latest?.rootCauseStatement || null,
    actionType: latest?.actionType || "UNSET",
    actionPlan: latest?.actionPlan || null,
    dueAt,
    ownerEmail: latest?.ownerEmail || null,
    successMetric: latest?.successMetric || null,
    targetValue: latest?.targetValue || null,
    updatedAt: latest?.at || null,
    updatedBy: latest?.actorEmail || null,
    closed,
    closedAt: closed ? state?.at || null : null,
    closedBy: closed ? state?.actorEmail || null : null,
    overdue: Boolean(!closed && dueAt && dueAt < today && !["EFFECTIVE", "ACCEPTED_RISK"].includes(status)),
    notes: scoped.filter((event) => event.type === "IMPROVEMENT_NOTE_ADDED" && event.note).map((event) => ({ id: event.id, at: event.at, actorEmail: event.actorEmail, note: event.note! })),
    effect: effectEvidence(snapshot, weeklySettings, now),
  };
}

export function buildContinuousImprovementRegister(
  settings: ContinuousImprovementSettings,
  weeklySettings: WeeklyManagementSettings,
  role: AccessRole,
  now = new Date(),
): ContinuousImprovementRegister {
  const today = now.toISOString().slice(0, 10);
  const snapshots = [...currentSnapshots(settings.events).values()].filter((snapshot) => role === "OWNER" || snapshot.role === role);
  const improvements = snapshots
    .map((snapshot) => viewForImprovement(snapshot, settings.events, weeklySettings, today, now))
    .sort((a, b) => Number(a.closed) - Number(b.closed) || Number(b.overdue) - Number(a.overdue) || b.createdAt.localeCompare(a.createdAt));
  const candidates = buildImprovementCandidates(weeklySettings, role, now, settings);
  return {
    generatedAt: now.toISOString(),
    role,
    summary: {
      improvements: improvements.length,
      active: improvements.filter((item) => !item.closed).length,
      overdue: improvements.filter((item) => item.overdue).length,
      verifying: improvements.filter((item) => !item.closed && item.status === "VERIFYING").length,
      effective: improvements.filter((item) => item.status === "EFFECTIVE").length,
      ineffective: improvements.filter((item) => item.status === "INEFFECTIVE").length,
      suggestedCandidates: candidates.filter((item) => !item.existingImprovementId).length,
    },
    candidates,
    improvements,
    warnings: candidates.length === 0 ? ["Ingen tilbakevendende flaskehalser oppfyller terskelen ennå."] : [],
    safety: {
      appendOnlyHistory: true,
      serverGeneratedEvidence: true,
      automaticTaskCreation: false,
      automaticCustomerContact: false,
      automaticPipelineChanges: false,
      improvementOwnerIsNotAssignment: true,
      measuredTrendIsNotCausality: true,
    },
  };
}

export function improvementById(register: ContinuousImprovementRegister, improvementId: string) {
  return register.improvements.find((item) => item.id === improvementId) || null;
}

export function candidateById(register: ContinuousImprovementRegister, candidateId: string) {
  return register.candidates.find((item) => item.id === candidateId) || null;
}

export function canWriteContinuousImprovement(role: AccessRole) {
  return role !== "VIEWER";
}

export function makeImprovementEvent(input: Omit<ImprovementEvent, "id" | "at"> & { id?: string; at?: string }): ImprovementEvent {
  return { ...input, id: input.id || crypto.randomUUID(), at: input.at || new Date().toISOString() };
}
