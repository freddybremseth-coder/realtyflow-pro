import test from "node:test";
import assert from "node:assert/strict";
import type { AccessRole } from "@/lib/access-control";
import type { ExecutiveBriefing } from "@/lib/revenue/executive-briefing";
import {
  buildOperatingReviewJournal,
  compactOperatingReviewEvents,
  createOperatingReviewSnapshot,
  makeOperatingReviewEvent,
  type OperatingReviewEvent,
  type OperatingReviewSettings,
} from "@/lib/revenue/operating-review";

function briefing(role: AccessRole = "SALES", suffix = "A"): ExecutiveBriefing {
  return {
    generatedAt: "2026-07-12T07:00:00.000Z",
    role,
    roleLabel: role,
    state: "ATTENTION",
    headline: `Følg opp dagens saker ${suffix}`,
    summary: {
      activeAlerts: 1,
      criticalAlerts: 0,
      decisionsToday: 1,
      overdueExecution: 1,
      calendarToday: 0,
      highRiskClosings: role === "SALES" ? null : 1,
      overdueCommission: role === "FINANCE" || role === "OWNER" ? 15000 : null,
      keyholdingRenewals: role === "KEYHOLDING" || role === "OWNER" ? 2 : null,
      goalsBehind: 1,
      unassignedPriorityWork: 0,
    },
    decisions: [{
      id: "decision:lead-1",
      source: role === "FINANCE" ? "FINANCE" : "SALES",
      severity: "HIGH",
      score: 85,
      title: `Prioritert oppfølging ${suffix}`,
      subject: "Kunde Test",
      detail: `Detalj ${suffix}`,
      recommendedAction: `Ring kunden manuelt ${suffix}`,
      href: "/today",
      contactId: "lead-1",
      ownerEmail: null,
      dueAt: "2026-07-12T12:00:00.000Z",
      amountEur: role === "FINANCE" ? 15000 : null,
    }],
    agenda: [],
    goals: [{
      id: "deals",
      label: "Vunnede salg",
      unit: "COUNT",
      target: 4,
      actual: 1,
      projected: 2,
      progressPercent: 25,
      expectedPace: 2,
      gap: 3,
      status: "BEHIND",
      detail: "Ligger bak plan",
    }],
    team: { members: 2, overloaded: 0, unassigned: 0, overdue: 1 },
    dataSources: [{ id: "crm", label: "CRM", available: true, generatedAt: "2026-07-12T07:00:00.000Z", warning: null }],
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

function settings(events: OperatingReviewEvent[]): OperatingReviewSettings {
  return { version: 1, events, updatedAt: events[0]?.at || null };
}

test("captures a server briefing as an immutable review snapshot", () => {
  const source = briefing("SALES");
  const snapshot = createOperatingReviewSnapshot(source, "sales@example.com", new Date("2026-07-12T08:00:00.000Z"), {
    reviewId: "review-sales-1",
  });
  assert.equal(snapshot.reviewDate, "2026-07-12");
  assert.equal(snapshot.capturedRole, "SALES");
  assert.equal(snapshot.decisions.length, 1);
  assert.ok(snapshot.decisions[0].fingerprint);
  assert.ok(snapshot.fingerprint);
  source.decisions[0].title = "Endret etter snapshot";
  assert.equal(snapshot.decisions[0].title, "Prioritert oppfølging A");
});

test("isolates role journals while owner can review all roles", () => {
  const sales = createOperatingReviewSnapshot(briefing("SALES"), "sales@example.com", new Date("2026-07-12T08:00:00.000Z"), { reviewId: "review-sales" });
  const finance = createOperatingReviewSnapshot(briefing("FINANCE"), "finance@example.com", new Date("2026-07-12T09:00:00.000Z"), { reviewId: "review-finance" });
  const events = [
    makeOperatingReviewEvent({ id: "capture-finance", at: finance.capturedAt, type: "REVIEW_CAPTURED", actorEmail: finance.capturedBy, actorRole: "FINANCE", reviewId: finance.id, reviewDate: finance.reviewDate, snapshot: finance, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
    makeOperatingReviewEvent({ id: "capture-sales", at: sales.capturedAt, type: "REVIEW_CAPTURED", actorEmail: sales.capturedBy, actorRole: "SALES", reviewId: sales.id, reviewDate: sales.reviewDate, snapshot: sales, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
  ];
  assert.deepEqual(buildOperatingReviewJournal(settings(events), "SALES", new Date("2026-07-12T10:00:00.000Z")).reviews.map((item) => item.id), ["review-sales"]);
  assert.equal(buildOperatingReviewJournal(settings(events), "FINANCE", new Date("2026-07-12T10:00:00.000Z")).reviews.length, 1);
  assert.equal(buildOperatingReviewJournal(settings(events), "OWNER", new Date("2026-07-12T10:00:00.000Z")).reviews.length, 2);
});

test("applies a decision only to the matching decision fingerprint", () => {
  const first = createOperatingReviewSnapshot(briefing("SALES", "A"), "sales@example.com", new Date("2026-07-12T08:00:00.000Z"), { reviewId: "review-1", revision: 1 });
  const updated = createOperatingReviewSnapshot(briefing("SALES", "B"), "sales@example.com", new Date("2026-07-12T09:00:00.000Z"), { reviewId: "review-1", revision: 2 });
  const oldDecision = first.decisions[0];
  const events = [
    makeOperatingReviewEvent({ id: "refresh", at: updated.capturedAt, type: "REVIEW_REFRESHED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: updated.id, reviewDate: updated.reviewDate, snapshot: updated, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
    makeOperatingReviewEvent({ id: "decision-old", at: "2026-07-12T08:30:00.000Z", type: "DECISION_UPDATED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: first.id, reviewDate: first.reviewDate, snapshot: null, decisionId: oldDecision.id, decisionFingerprint: oldDecision.fingerprint, previousStatus: "OPEN", status: "ACTION_PLANNED", note: "Følg opp", followupAt: "2026-07-13", responsibleEmail: "sales@example.com" }),
    makeOperatingReviewEvent({ id: "capture", at: first.capturedAt, type: "REVIEW_CAPTURED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: first.id, reviewDate: first.reviewDate, snapshot: first, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
  ];
  const review = buildOperatingReviewJournal(settings(events), "SALES", new Date("2026-07-12T10:00:00.000Z")).reviews[0];
  assert.equal(review.revision, 2);
  assert.equal(review.decisions[0].status, "OPEN");
  assert.equal(review.undecided, 1);
});

test("tracks recorded, outstanding and overdue follow-ups", () => {
  const snapshot = createOperatingReviewSnapshot(briefing("SALES"), "sales@example.com", new Date("2026-07-10T08:00:00.000Z"), { reviewId: "review-overdue" });
  const decision = snapshot.decisions[0];
  const events = [
    makeOperatingReviewEvent({ id: "decision", at: "2026-07-10T09:00:00.000Z", type: "DECISION_UPDATED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot: null, decisionId: decision.id, decisionFingerprint: decision.fingerprint, previousStatus: "OPEN", status: "ACTION_PLANNED", note: "Avklart", followupAt: "2026-07-11", responsibleEmail: "sales@example.com" }),
    makeOperatingReviewEvent({ id: "capture", at: snapshot.capturedAt, type: "REVIEW_CAPTURED", actorEmail: snapshot.capturedBy, actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
  ];
  const journal = buildOperatingReviewJournal(settings(events), "SALES", new Date("2026-07-12T10:00:00.000Z"));
  assert.equal(journal.reviews[0].recordedDecisions, 1);
  assert.equal(journal.reviews[0].outstandingFollowups, 1);
  assert.equal(journal.reviews[0].overdueFollowups, 1);
  assert.equal(journal.summary.overdueFollowups, 1);
});

test("derives review completion from the latest append-only review event", () => {
  const snapshot = createOperatingReviewSnapshot(briefing("SALES"), "sales@example.com", new Date("2026-07-12T08:00:00.000Z"), { reviewId: "review-completion" });
  const events = [
    makeOperatingReviewEvent({ id: "reopen", at: "2026-07-12T11:00:00.000Z", type: "REVIEW_REOPENED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot: null, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: "Ny informasjon", followupAt: null, responsibleEmail: null }),
    makeOperatingReviewEvent({ id: "complete", at: "2026-07-12T10:00:00.000Z", type: "REVIEW_COMPLETED", actorEmail: "sales@example.com", actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot: null, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: "Møtet ferdig", followupAt: null, responsibleEmail: null }),
    makeOperatingReviewEvent({ id: "capture", at: snapshot.capturedAt, type: "REVIEW_CAPTURED", actorEmail: snapshot.capturedBy, actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }),
  ];
  const review = buildOperatingReviewJournal(settings(events), "SALES", new Date("2026-07-12T12:00:00.000Z")).reviews[0];
  assert.equal(review.completed, false);
  assert.equal(review.completedAt, null);
});

test("compacts history by retaining events for the newest 180 reviews", () => {
  const events: OperatingReviewEvent[] = [];
  for (let index = 0; index < 181; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    const snapshot = createOperatingReviewSnapshot(briefing("SALES"), "sales@example.com", new Date(`2026-06-${day}T08:00:00.000Z`), { reviewId: `review-${index}` });
    events.push(makeOperatingReviewEvent({ id: `capture-${index}`, at: new Date(2_000_000_000_000 - index * 1000).toISOString(), type: "REVIEW_CAPTURED", actorEmail: snapshot.capturedBy, actorRole: "SALES", reviewId: snapshot.id, reviewDate: snapshot.reviewDate, snapshot, decisionId: null, decisionFingerprint: null, previousStatus: null, status: null, note: null, followupAt: null, responsibleEmail: null }));
  }
  const compacted = compactOperatingReviewEvents(events);
  assert.equal(new Set(compacted.map((event) => event.reviewId)).size, 180);
  assert.equal(compacted.some((event) => event.reviewId === "review-180"), false);
});
