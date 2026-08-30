import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusInbox, summarizeNexusInbox } from "@/lib/nexus-inbox";

test("Nexus Inbox combines system, approval, marketing and high email identity attention", () => {
  const items = buildNexusInbox({
    attention: [{ id: "os:1", severity: "high", title: "Systemfeil", detail: "Må ryddes", href: "/os" }],
    approvals: [{ id: "a1", title: "Kjøperprofil", summary: "Klar", ready: true, blocker: null, ageDays: 4, customerName: "Kunde", reviewHref: "/lead-intelligence" }],
    marketingRows: [{ brandId: "freddyb", brandName: "Freddy Bremseth", platform: "facebook", connected: true, pilotReady: false, pilotBlockReason: "Mangler readiness", published: 0, measuredEligible: 0, quarantined: 2, liveLearning: false }],
    emailIdentityReviews: [
      { id: "mail-conflict", subject: "Re: bolig", priority: "high", reason: "Identitetskonflikt krever review.", state: "ambiguous", domain: "example.com", occurredAt: "2026-08-30T09:00:00Z" },
      { id: "mail-low", subject: "Nyhetsbrev", priority: "low", reason: "Lavt signal.", state: "unlinked", domain: "example.org", occurredAt: "2026-08-30T10:00:00Z" },
    ],
  });

  assert.equal(items.some((item) => item.id === "email-identity:mail-conflict"), true);
  assert.equal(items.some((item) => item.id === "email-identity:mail-low"), false);
  assert.equal(items.find((item) => item.id === "email-identity:mail-conflict")?.priority, "critical");
  assert.equal(items.find((item) => item.id === "email-identity:mail-conflict")?.href, "/nexus-os/email-link-health?messageId=mail-conflict");
  const summary = summarizeNexusInbox(items);
  assert.deepEqual(summary, { total: 5, critical: 3, approvals: 1, marketing: 2, emailIdentity: 1, system: 1 });
});

test("blocked approval stays visible but is not elevated above ready work", () => {
  const items = buildNexusInbox({
    attention: [],
    approvals: [
      { id: "blocked", title: "Presentation", summary: null, ready: false, blocker: "Shortlisten må godkjennes først.", ageDays: 10, customerName: "A", reviewHref: "/lead-intelligence" },
      { id: "ready", title: "Shortlist", summary: "Klar", ready: true, blocker: null, ageDays: 1, customerName: "B", reviewHref: "/lead-intelligence" },
    ],
    marketingRows: [],
    emailIdentityReviews: [],
  });

  assert.equal(items[0]?.id, "approval:ready");
  assert.equal(items[1]?.blocked, true);
});

test("high exact candidate is visible as high but not critical email attention", () => {
  const items = buildNexusInbox({
    attention: [],
    approvals: [],
    marketingRows: [],
    emailIdentityReviews: [{ id: "candidate/with space", subject: "Interested in villa", priority: "high", reason: "Entydig eksakt CRM-kandidat.", state: "exact_candidate", domain: "gmail.com", occurredAt: "2026-08-30T10:00:00Z" }],
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.source, "email_identity");
  assert.equal(items[0]?.priority, "high");
  assert.equal(items[0]?.href, "/nexus-os/email-link-health?messageId=candidate%2Fwith%20space");
});

test("same-priority email identity review is ordered newest first without changing other source ordering", () => {
  const items = buildNexusInbox({
    attention: [],
    approvals: [],
    marketingRows: [],
    emailIdentityReviews: [
      { id: "older", subject: "A older subject", priority: "high", reason: "Review", state: "unlinked", occurredAt: "2026-08-28T10:00:00Z" },
      { id: "newer", subject: "Z newer subject", priority: "high", reason: "Review", state: "unlinked", occurredAt: "2026-08-30T10:00:00Z" },
      { id: "unknown-date", subject: "B unknown date", priority: "high", reason: "Review", state: "unlinked", occurredAt: null },
    ],
  });

  assert.deepEqual(items.map((item) => item.id), [
    "email-identity:newer",
    "email-identity:older",
    "email-identity:unknown-date",
  ]);
  assert.equal(items[0]?.occurredAt, "2026-08-30T10:00:00Z");
});
