import test from "node:test";
import assert from "node:assert/strict";
import {
  buildContinuousImprovementRegister,
  buildImprovementCandidates,
  compactContinuousImprovementEvents,
  createImprovementSnapshot,
  improvementCandidateKey,
  makeImprovementEvent,
  parseContinuousImprovementSettings,
  type ContinuousImprovementSettings,
  type ImprovementCandidate,
  type ImprovementEvent,
} from "./continuous-improvement";
import { operatingReviewFingerprint } from "./operating-review";
import type {
  WeeklyManagementEvent,
  WeeklyManagementIssue,
  WeeklyManagementSettings,
  WeeklyManagementSnapshot,
} from "./weekly-management-review";

const emptyMetrics = {
  reviews: 1,
  completedReviews: 1,
  reviewCompletionRate: 100,
  uniqueDecisions: 1,
  decisionsRecorded: 1,
  decisionsResolved: 0,
  decisionsCompleted: 0,
  decisionsNoAction: 0,
  decisionsOpen: 0,
  activeFollowups: 1,
  overdueFollowups: 1,
  repeatedDeferrals: 0,
  completionRate: 0,
  decisionCoverageRate: 100,
  onTimeCompletionRate: null,
  averageActiveAgeDays: 10,
};

function issue(overrides: Partial<WeeklyManagementIssue> = {}): WeeklyManagementIssue {
  const base = {
    id: "weekly:OVERDUE_FOLLOWUP:lead-1",
    type: "OVERDUE_FOLLOWUP" as const,
    severity: "HIGH" as const,
    source: "SALES" as const,
    title: "Forfalt beslutningsoppfølging",
    subject: "Lead A",
    detail: "Oppfølgingen er forfalt.",
    recommendedAction: "Avklar neste steg.",
    href: "/today",
    decisionKey: "SALES:lead-1",
    appearances: 3,
    deferrals: 1,
    daysOpen: 18,
    amountEur: null,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, fingerprint: operatingReviewFingerprint(merged) };
}

function snapshot(weekStart: string, issues: WeeklyManagementIssue[], role: "SALES" | "FINANCE" = "SALES"): WeeklyManagementSnapshot {
  const weekEndDate = new Date(`${weekStart}T12:00:00Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const base = {
    id: `review-${role}-${weekStart}`,
    weekStart,
    weekEnd: weekEndDate.toISOString().slice(0, 10),
    revision: 1,
    capturedAt: `${weekStart}T08:00:00.000Z`,
    capturedBy: "owner@example.com",
    capturedRole: role,
    metrics: { ...emptyMetrics, uniqueDecisions: issues.length },
    previousWeek: null,
    comparison: { completionRateDelta: null, overdueFollowupsDelta: null, repeatedDeferralsDelta: null },
    bySource: [],
    byRole: [],
    issues,
    warnings: [],
  };
  return { ...base, fingerprint: operatingReviewFingerprint(base) };
}

function weeklySettings(rows: Array<{ week: string; issues?: WeeklyManagementIssue[]; role?: "SALES" | "FINANCE" }>): WeeklyManagementSettings {
  const events: WeeklyManagementEvent[] = rows.map((row, index) => {
    const snap = snapshot(row.week, row.issues || [], row.role || "SALES");
    return {
      id: `weekly-event-${index}`,
      type: "WEEK_CAPTURED",
      at: snap.capturedAt,
      actorEmail: "owner@example.com",
      actorRole: "OWNER",
      reviewId: snap.id,
      weekStart: snap.weekStart,
      snapshot: snap,
      issueId: null,
      issueFingerprint: null,
      previousStatus: null,
      status: null,
      note: null,
      followupAt: null,
      responsibleEmail: null,
    };
  }).sort((a, b) => b.at.localeCompare(a.at));
  return { version: 1, events, updatedAt: events[0]?.at || null };
}

const emptySettings: ContinuousImprovementSettings = { version: 1, events: [], updatedAt: null };

test("candidate key remains stable across weekly fingerprints", () => {
  const first = issue({ fingerprint: "one" });
  const second = issue({ fingerprint: "two", detail: "Ny detalj" });
  assert.equal(improvementCandidateKey("SALES", first), improvementCandidateKey("SALES", second));
});

test("repeated weekly issue becomes an improvement candidate", () => {
  const weekly = weeklySettings([
    { week: "2026-06-29", issues: [issue()] },
    { week: "2026-07-06", issues: [issue({ daysOpen: 25, deferrals: 2 })] },
  ]);
  const candidates = buildImprovementCandidates(weekly, "SALES", new Date("2026-07-12T10:00:00Z"), emptySettings);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].occurrenceWeeks, 2);
  assert.equal(candidates[0].observedWeeks, 2);
  assert.equal(candidates[0].occurrenceRate, 100);
  assert.equal(candidates[0].maximumDaysOpen, 25);
});

test("server baseline and two absent weeks produce resolved evidence", () => {
  const baselineWeekly = weeklySettings([
    { week: "2026-06-29", issues: [issue()] },
    { week: "2026-07-06", issues: [issue({ daysOpen: 25 })] },
  ]);
  const candidate = buildImprovementCandidates(baselineWeekly, "SALES", new Date("2026-07-12T10:00:00Z"), emptySettings)[0];
  const improvement = createImprovementSnapshot(candidate, "sales@example.com", new Date("2026-07-12T10:00:00Z"), "improvement-1");
  const created = makeImprovementEvent({
    id: "created-1",
    at: "2026-07-12T10:00:00.000Z",
    type: "IMPROVEMENT_CREATED",
    actorEmail: "sales@example.com",
    actorRole: "SALES",
    improvementId: improvement.id,
    snapshot: improvement,
    previousStatus: null,
    status: null,
    rootCauseCategory: null,
    rootCauseStatement: null,
    actionType: null,
    actionPlan: null,
    dueAt: null,
    ownerEmail: null,
    successMetric: null,
    targetValue: null,
    note: null,
  });
  const weekly = weeklySettings([
    { week: "2026-06-29", issues: [issue()] },
    { week: "2026-07-06", issues: [issue()] },
    { week: "2026-07-13", issues: [] },
    { week: "2026-07-20", issues: [] },
  ]);
  const register = buildContinuousImprovementRegister({ version: 1, events: [created], updatedAt: created.at }, weekly, "SALES", new Date("2026-07-26T10:00:00Z"));
  assert.equal(register.improvements[0].effect.trend, "RESOLVED");
  assert.equal(register.improvements[0].effect.consecutiveAbsentWeeks, 2);
  assert.equal(register.improvements[0].status, "OPEN");
});

test("manual update remains separate from measured trend and can become overdue", () => {
  const candidate: ImprovementCandidate = {
    id: "SALES:SOURCE_BOTTLENECK:SALES",
    role: "SALES",
    source: "SALES",
    issueType: "SOURCE_BOTTLENECK",
    severity: "HIGH",
    title: "Flaskehals i arbeidsområde",
    subject: "Salg",
    detail: "Lav løsningsgrad",
    recommendedAction: "Gjennomgå kapasitet",
    href: "/weekly-management-review",
    decisionKey: null,
    firstWeek: "2026-06-29",
    lastWeek: "2026-07-06",
    observedWeeks: 2,
    occurrenceWeeks: 2,
    totalOccurrences: 2,
    overdueInstances: 0,
    repeatedDeferrals: 0,
    maximumDaysOpen: null,
    amountEur: null,
    occurrenceRate: 100,
    fingerprint: "candidate-fp",
    existingImprovementId: null,
  };
  const snap = createImprovementSnapshot(candidate, "sales@example.com", new Date("2026-07-06T10:00:00Z"), "improvement-2");
  const events: ImprovementEvent[] = [
    makeImprovementEvent({
      id: "update-2", at: "2026-07-08T10:00:00Z", type: "IMPROVEMENT_UPDATED", actorEmail: "sales@example.com", actorRole: "SALES", improvementId: snap.id,
      snapshot: null, previousStatus: "OPEN", status: "IN_PROGRESS", rootCauseCategory: "CAPACITY", rootCauseStatement: "For mange aktive saker", actionType: "CAPACITY_CHANGE",
      actionPlan: "Fordel nye leads", dueAt: "2026-07-10", ownerEmail: "sales@example.com", successMetric: "Aktive saker", targetValue: "Under 10", note: null,
    }),
    makeImprovementEvent({
      id: "created-2", at: "2026-07-06T10:00:00Z", type: "IMPROVEMENT_CREATED", actorEmail: "sales@example.com", actorRole: "SALES", improvementId: snap.id,
      snapshot: snap, previousStatus: null, status: null, rootCauseCategory: null, rootCauseStatement: null, actionType: null, actionPlan: null, dueAt: null,
      ownerEmail: null, successMetric: null, targetValue: null, note: null,
    }),
  ];
  const weekly = weeklySettings([{ week: "2026-07-06", issues: [] }]);
  const register = buildContinuousImprovementRegister({ version: 1, events, updatedAt: events[0].at }, weekly, "SALES", new Date("2026-07-12T10:00:00Z"));
  assert.equal(register.improvements[0].status, "IN_PROGRESS");
  assert.equal(register.improvements[0].rootCauseCategory, "CAPACITY");
  assert.equal(register.improvements[0].overdue, true);
  assert.equal(register.improvements[0].effect.trend, "NOT_ENOUGH_DATA");
});

test("register isolates roles while owner sees all", () => {
  const salesCandidate = buildImprovementCandidates(weeklySettings([
    { week: "2026-06-29", issues: [issue()] }, { week: "2026-07-06", issues: [issue()] },
  ]), "SALES", new Date("2026-07-12T10:00:00Z"), emptySettings)[0];
  const financeIssue = issue({ id: "finance", source: "FINANCE", decisionKey: "FINANCE:invoice", subject: "Faktura" });
  const financeCandidate = buildImprovementCandidates(weeklySettings([
    { week: "2026-06-29", issues: [financeIssue], role: "FINANCE" }, { week: "2026-07-06", issues: [financeIssue], role: "FINANCE" },
  ]), "FINANCE", new Date("2026-07-12T10:00:00Z"), emptySettings)[0];
  const salesSnap = createImprovementSnapshot(salesCandidate, "owner@example.com", new Date(), "sales-improvement");
  const financeSnap = createImprovementSnapshot(financeCandidate, "owner@example.com", new Date(), "finance-improvement");
  const events = [salesSnap, financeSnap].map((snap, index) => makeImprovementEvent({
    id: `created-role-${index}`, type: "IMPROVEMENT_CREATED", actorEmail: "owner@example.com", actorRole: "OWNER", improvementId: snap.id, snapshot: snap,
    previousStatus: null, status: null, rootCauseCategory: null, rootCauseStatement: null, actionType: null, actionPlan: null, dueAt: null, ownerEmail: null,
    successMetric: null, targetValue: null, note: null,
  }));
  const combinedWeekly = weeklySettings([
    { week: "2026-06-29", issues: [issue()] }, { week: "2026-07-06", issues: [issue()] },
    { week: "2026-06-29", issues: [financeIssue], role: "FINANCE" }, { week: "2026-07-06", issues: [financeIssue], role: "FINANCE" },
  ]);
  const settings = { version: 1 as const, events, updatedAt: events[0].at };
  assert.equal(buildContinuousImprovementRegister(settings, combinedWeekly, "SALES").improvements.length, 1);
  assert.equal(buildContinuousImprovementRegister(settings, combinedWeekly, "OWNER").improvements.length, 2);
});

test("parser rejects malformed records and compaction keeps bounded improvements", () => {
  const parsed = parseContinuousImprovementSettings({ events: [{ id: "bad" }] });
  assert.equal(parsed.events.length, 0);
  const events: ImprovementEvent[] = [];
  for (let index = 0; index < 245; index += 1) {
    const candidate: ImprovementCandidate = {
      id: `candidate-${index}`, role: "SALES", source: "SALES", issueType: "SOURCE_BOTTLENECK", severity: "MEDIUM", title: "T", subject: `S${index}`,
      detail: "D", recommendedAction: "A", href: "/", decisionKey: null, firstWeek: "2026-01-05", lastWeek: "2026-01-05", observedWeeks: 1,
      occurrenceWeeks: 1, totalOccurrences: 1, overdueInstances: 0, repeatedDeferrals: 0, maximumDaysOpen: null, amountEur: null, occurrenceRate: 100,
      fingerprint: `fp-${index}`, existingImprovementId: null,
    };
    const snap = createImprovementSnapshot(candidate, "sales@example.com", new Date(2026, 0, 1, 0, index), `improvement-${index}`);
    events.push(makeImprovementEvent({ id: `event-${index}`, at: snap.createdAt, type: "IMPROVEMENT_CREATED", actorEmail: "sales@example.com", actorRole: "SALES", improvementId: snap.id,
      snapshot: snap, previousStatus: null, status: null, rootCauseCategory: null, rootCauseStatement: null, actionType: null, actionPlan: null, dueAt: null,
      ownerEmail: null, successMetric: null, targetValue: null, note: null }));
  }
  assert.equal(new Set(compactContinuousImprovementEvents(events).map((event) => event.improvementId)).size, 240);
});
