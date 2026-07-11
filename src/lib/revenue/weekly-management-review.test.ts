import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWeeklyManagementJournal,
  compactWeeklyManagementEvents,
  createWeeklyManagementSnapshot,
  makeWeeklyManagementEvent,
  madridWeekStart,
  type WeeklyManagementEvent,
  type WeeklyManagementSettings,
} from "./weekly-management-review";
import {
  createOperatingReviewSnapshot,
  makeOperatingReviewEvent,
  type OperatingReviewEvent,
  type OperatingReviewSettings,
} from "./operating-review";
import type { ExecutiveBriefing, ExecutiveDecision } from "./executive-briefing";
import type { AccessRole } from "../access-control";

function decision(id: string, source: ExecutiveDecision["source"] = "CLOSING"): ExecutiveDecision {
  return {
    id,
    source,
    severity: source === "FINANCE" ? "HIGH" : "CRITICAL",
    score: 90,
    title: `Decision ${id}`,
    subject: `Subject ${id}`,
    detail: "Needs management attention",
    recommendedAction: "Choose a concrete next step",
    href: source === "FINANCE" ? "/commissions" : "/closing",
    contactId: `contact-${id}`,
    ownerEmail: null,
    dueAt: null,
    amountEur: source === "FINANCE" ? 25000 : 500000,
  };
}

function briefing(role: AccessRole, decisions: ExecutiveDecision[], at: string): ExecutiveBriefing {
  return {
    generatedAt: at,
    role,
    roleLabel: role,
    state: decisions.length ? "ATTENTION" : "ON_TRACK",
    headline: "Weekly test briefing",
    summary: {
      activeAlerts: 0,
      criticalAlerts: 0,
      decisionsToday: decisions.length,
      overdueExecution: 0,
      calendarToday: 0,
      highRiskClosings: 0,
      overdueCommission: 0,
      keyholdingRenewals: 0,
      goalsBehind: 0,
      unassignedPriorityWork: 0,
    },
    decisions,
    agenda: [],
    goals: [],
    team: { members: 1, overloaded: 0, unassigned: 0, overdue: 0 },
    dataSources: [{ id: "crm", label: "CRM", available: true, generatedAt: at, warning: null }],
    warnings: [],
    safety: {
      readOnly: true,
      automaticSending: false,
      automaticTaskCreation: false,
      automaticCalendarChanges: false,
      automaticPipelineChanges: false,
    },
  };
}

function capture(role: AccessRole, reviewId: string, at: string, decisions: ExecutiveDecision[]) {
  const snapshot = createOperatingReviewSnapshot(briefing(role, decisions, at), `${role.toLowerCase()}@example.com`, new Date(at), { reviewId });
  return {
    snapshot,
    event: makeOperatingReviewEvent({
      type: "REVIEW_CAPTURED",
      actorEmail: `${role.toLowerCase()}@example.com`,
      actorRole: role,
      reviewId,
      reviewDate: snapshot.reviewDate,
      snapshot,
      decisionId: null,
      decisionFingerprint: null,
      previousStatus: null,
      status: null,
      note: null,
      followupAt: null,
      responsibleEmail: null,
      at,
    }),
  };
}

function update(review: ReturnType<typeof capture>, decisionId: string, status: "ACTION_PLANNED" | "DEFERRED" | "COMPLETED", at: string, followupAt: string | null): OperatingReviewEvent {
  const item = review.snapshot.decisions.find((row) => row.id === decisionId)!;
  return makeOperatingReviewEvent({
    type: "DECISION_UPDATED",
    actorEmail: "owner@example.com",
    actorRole: review.snapshot.capturedRole,
    reviewId: review.snapshot.id,
    reviewDate: review.snapshot.reviewDate,
    snapshot: null,
    decisionId,
    decisionFingerprint: item.fingerprint,
    previousStatus: null,
    status,
    note: null,
    followupAt,
    responsibleEmail: null,
    at,
  });
}

function complete(review: ReturnType<typeof capture>, at: string): OperatingReviewEvent {
  return makeOperatingReviewEvent({
    type: "REVIEW_COMPLETED",
    actorEmail: "owner@example.com",
    actorRole: review.snapshot.capturedRole,
    reviewId: review.snapshot.id,
    reviewDate: review.snapshot.reviewDate,
    snapshot: null,
    decisionId: null,
    decisionFingerprint: null,
    previousStatus: null,
    status: null,
    note: null,
    followupAt: null,
    responsibleEmail: null,
    at,
  });
}

function operatingFixture(): OperatingReviewSettings {
  const previous = capture("OWNER", "previous", "2026-06-30T08:00:00.000Z", [decision("old", "FINANCE")]);
  const first = capture("OWNER", "day-1", "2026-07-06T08:00:00.000Z", [decision("repeat"), decision("done", "FINANCE")]);
  const second = capture("OWNER", "day-2", "2026-07-07T08:00:00.000Z", [decision("repeat")]);
  const third = capture("OWNER", "day-3", "2026-07-08T08:00:00.000Z", [decision("repeat")]);
  const events: OperatingReviewEvent[] = [
    update(third, "repeat", "ACTION_PLANNED", "2026-07-08T09:00:00.000Z", "2026-07-09"),
    third.event,
    update(second, "repeat", "DEFERRED", "2026-07-07T09:00:00.000Z", "2026-07-08"),
    second.event,
    complete(first, "2026-07-09T11:00:00.000Z"),
    update(first, "done", "COMPLETED", "2026-07-09T10:00:00.000Z", null),
    update(first, "done", "ACTION_PLANNED", "2026-07-06T09:30:00.000Z", "2026-07-10"),
    update(first, "repeat", "DEFERRED", "2026-07-06T09:00:00.000Z", "2026-07-07"),
    first.event,
    update(previous, "old", "COMPLETED", "2026-07-01T09:00:00.000Z", null),
    previous.event,
  ].sort((a, b) => b.at.localeCompare(a.at));
  return { version: 1, events, updatedAt: events[0].at };
}

test("Madrid week starts on Monday", () => {
  assert.equal(madridWeekStart(new Date("2026-07-12T10:00:00.000Z")), "2026-07-06");
});

test("weekly snapshot measures outcomes and repeated deferrals", () => {
  const snapshot = createWeeklyManagementSnapshot(operatingFixture(), "OWNER", "owner@example.com", new Date("2026-07-12T10:00:00.000Z"));
  assert.equal(snapshot.weekStart, "2026-07-06");
  assert.equal(snapshot.metrics.reviews, 3);
  assert.equal(snapshot.metrics.uniqueDecisions, 2);
  assert.equal(snapshot.metrics.decisionsCompleted, 1);
  assert.equal(snapshot.metrics.repeatedDeferrals, 1);
  assert.equal(snapshot.metrics.overdueFollowups, 1);
  assert.equal(snapshot.metrics.onTimeCompletionRate, 100);
  assert.ok(snapshot.issues.some((issue) => issue.type === "OVERDUE_FOLLOWUP" || issue.type === "REPEATED_DEFERRAL"));
  assert.ok(snapshot.previousWeek);
});

test("role snapshots only use operating reviews visible to that role", () => {
  const owner = capture("OWNER", "owner-review", "2026-07-06T08:00:00.000Z", [decision("owner")]);
  const sales = capture("SALES", "sales-review", "2026-07-07T08:00:00.000Z", [decision("sales", "SALES")]);
  const settings: OperatingReviewSettings = { version: 1, events: [sales.event, owner.event], updatedAt: sales.event.at };
  const salesSnapshot = createWeeklyManagementSnapshot(settings, "SALES", "sales@example.com", new Date("2026-07-12T10:00:00.000Z"));
  assert.equal(salesSnapshot.metrics.reviews, 1);
  assert.equal(salesSnapshot.byRole[0]?.id, "SALES");
});

test("conclusion does not carry forward after issue fingerprint changes", () => {
  const source = createWeeklyManagementSnapshot(operatingFixture(), "OWNER", "owner@example.com", new Date("2026-07-12T10:00:00.000Z"), { reviewId: "week-1" });
  const issue = source.issues[0];
  assert.ok(issue);
  const captured = makeWeeklyManagementEvent({
    type: "WEEK_CAPTURED", actorEmail: "owner@example.com", actorRole: "OWNER", reviewId: source.id, weekStart: source.weekStart,
    snapshot: source, issueId: null, issueFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null,
    at: "2026-07-12T10:00:00.000Z",
  });
  const conclusion = makeWeeklyManagementEvent({
    type: "ISSUE_UPDATED", actorEmail: "owner@example.com", actorRole: "OWNER", reviewId: source.id, weekStart: source.weekStart,
    snapshot: null, issueId: issue.id, issueFingerprint: issue.fingerprint, previousStatus: "OPEN", status: "MONITOR", note: "Observe", followupAt: "2026-07-13", responsibleEmail: "owner@example.com",
    at: "2026-07-12T10:05:00.000Z",
  });
  const changed = { ...source, revision: 2, capturedAt: "2026-07-12T11:00:00.000Z", issues: source.issues.map((item, index) => index === 0 ? { ...item, fingerprint: `${item.fingerprint}-changed` } : item) };
  const refreshed = makeWeeklyManagementEvent({
    type: "WEEK_REFRESHED", actorEmail: "owner@example.com", actorRole: "OWNER", reviewId: source.id, weekStart: source.weekStart,
    snapshot: changed, issueId: null, issueFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null,
    at: "2026-07-12T11:00:00.000Z",
  });
  const settings: WeeklyManagementSettings = { version: 1, events: [refreshed, conclusion, captured], updatedAt: refreshed.at };
  const journal = buildWeeklyManagementJournal(settings, "OWNER", new Date("2026-07-12T12:00:00.000Z"));
  assert.equal(journal.reviews[0].issues[0].status, "OPEN");
  assert.equal(journal.reviews[0].issues[0].hasRecordedConclusion, false);
});

test("viewer sees history but cannot be treated as a separate role review", () => {
  const snapshot = createWeeklyManagementSnapshot(operatingFixture(), "OWNER", "owner@example.com", new Date("2026-07-12T10:00:00.000Z"), { reviewId: "week-owner" });
  const event = makeWeeklyManagementEvent({
    type: "WEEK_CAPTURED", actorEmail: "owner@example.com", actorRole: "OWNER", reviewId: snapshot.id, weekStart: snapshot.weekStart,
    snapshot, issueId: null, issueFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null,
  });
  const settings: WeeklyManagementSettings = { version: 1, events: [event], updatedAt: event.at };
  assert.equal(buildWeeklyManagementJournal(settings, "OWNER").reviews.length, 1);
  assert.equal(buildWeeklyManagementJournal(settings, "SALES").reviews.length, 0);
});

test("weekly history keeps the newest 104 reviews", () => {
  const events: WeeklyManagementEvent[] = [];
  for (let index = 0; index < 110; index += 1) {
    const weekStart = `2024-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`;
    const snapshot = createWeeklyManagementSnapshot({ version: 1, events: [], updatedAt: null }, "OWNER", "owner@example.com", new Date(`${weekStart}T10:00:00.000Z`), { reviewId: `review-${index}` });
    events.push(makeWeeklyManagementEvent({
      type: "WEEK_CAPTURED", actorEmail: "owner@example.com", actorRole: "OWNER", reviewId: snapshot.id, weekStart: snapshot.weekStart,
      snapshot, issueId: null, issueFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null,
      at: `${weekStart}T10:00:00.000Z`,
    }));
  }
  assert.equal(new Set(compactWeeklyManagementEvents(events).map((event) => event.reviewId)).size, 104);
});
