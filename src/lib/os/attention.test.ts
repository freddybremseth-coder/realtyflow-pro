import assert from "node:assert/strict";
import test from "node:test";
import { buildOsAttention, type OsAttentionInput } from "./attention";

function base(overrides: Partial<OsAttentionInput> = {}): OsAttentionInput {
  return {
    sourceErrors: [],
    approvalsPending: 0,
    approvalsHighRisk: 0,
    approvalOpportunityEur: 0,
    automationFailures24h: 0,
    automationPartial24h: 0,
    scheduledAutomationStale: [],
    emailAccountsNotReady: 0,
    emailAccountsSystemPaused: 0,
    socialSyncEnabled: true,
    socialLastSyncAt: "2026-08-25T16:55:00.000Z",
    socialLastSyncStatus: "success",
    instagramConnected: 3,
    instagramCommentReadReady: 3,
    socialSkippedMissingCapability: 0,
    socialAutoReplyLive: false,
    bookPending: 0,
    bookApproved: 0,
    bookApplied: 0,
    bookMeasuring: 0,
    bookRunningExperiments: 0,
    bookReviewCandidatesPending: 0,
    ...overrides,
  };
}

const now = new Date("2026-08-25T17:05:00.000Z");

test("source errors outrank operational queues", () => {
  const items = buildOsAttention(base({
    sourceErrors: [{ source: "Automation", message: "database timeout", href: "/automation" }],
    approvalsPending: 2,
    approvalsHighRisk: 2,
    automationFailures24h: 1,
  }), now);
  assert.equal(items[0].id, "source:Automation");
  assert.equal(items[0].severity, "high");
});

test("high-risk approval remains separate from execution", () => {
  const items = buildOsAttention(base({ approvalsPending: 1, approvalsHighRisk: 1, approvalOpportunityEur: 125000 }), now);
  const approval = items.find((item) => item.id === "approvals:pending");
  assert.ok(approval);
  assert.equal(approval.severity, "high");
  assert.match(approval.detail, /Approval betyr ikke utført handling/);
});

test("system-paused email account is high priority and routes to readiness", () => {
  const items = buildOsAttention(base({ emailAccountsNotReady: 2, emailAccountsSystemPaused: 1 }), now);
  const email = items.find((item) => item.id === "email:system-paused");
  assert.ok(email);
  assert.equal(email.severity, "high");
  assert.equal(email.href, "/nexus-os/communications/readiness");
  assert.match(email.detail, /backfill/);
});

test("non-ready email account without system pause stays medium", () => {
  const items = buildOsAttention(base({ emailAccountsNotReady: 2 }), now);
  const email = items.find((item) => item.id === "email:not-ready");
  assert.ok(email);
  assert.equal(email.severity, "medium");
  assert.match(email.detail, /aktiverer ikke kontoen automatisk/);
});

test("active scheduled automation without a fresh execution log is high priority", () => {
  const items = buildOsAttention(base({ scheduledAutomationStale: [
    { action: "email_ingest", label: "E-postinnhenting", lastRunAt: "2026-08-25T16:00:00.000Z", expectedMinutes: 15, href: "/nexus-os/communications" },
  ] }), now);
  const stale = items.find((item) => item.id === "automation:scheduler-stale");
  assert.ok(stale);
  assert.equal(stale.severity, "high");
  assert.match(stale.detail, /fersk faktisk execution-logg/);
});

test("stale social sync is high priority when read-only sync is enabled", () => {
  const items = buildOsAttention(base({ socialLastSyncAt: "2026-08-25T15:00:00.000Z" }), now);
  const stale = items.find((item) => item.id === "social:sync-stale");
  assert.ok(stale);
  assert.equal(stale.severity, "high");
});

test("missing Instagram comment capability is not interpreted as zero activity", () => {
  const items = buildOsAttention(base({ instagramCommentReadReady: 1, socialSkippedMissingCapability: 2 }), now);
  const scope = items.find((item) => item.id === "social:instagram-scope");
  assert.ok(scope);
  assert.match(scope.detail, /ukjent\/skipped/);
});

test("Book Growth pending review stays medium and never implies auto-apply", () => {
  const items = buildOsAttention(base({ bookPending: 25, bookReviewCandidatesPending: 18 }), now);
  const book = items.find((item) => item.id === "book-growth:review");
  assert.ok(book);
  assert.equal(book.severity, "medium");
  assert.match(book.detail, /Ingen kandidat blir auto-applied/);
});

test("healthy quiet state produces a single low-severity clear signal", () => {
  const items = buildOsAttention(base(), now);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "os:clear");
  assert.equal(items[0].severity, "low");
});
