import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNexusInbox, summarizeNexusInbox } from "@/lib/nexus-inbox";

test("Nexus Inbox combines system, approval and marketing attention", () => {
  const items = buildNexusInbox({
    attention: [{ id: "os:1", severity: "high", title: "Systemfeil", detail: "Må ryddes", href: "/os" }],
    approvals: [{ id: "a1", title: "Kjøperprofil", summary: "Klar", ready: true, blocker: null, ageDays: 4, customerName: "Kunde", reviewHref: "/lead-intelligence" }],
    marketingRows: [{ brandId: "freddyb", brandName: "Freddy Bremseth", platform: "facebook", connected: true, pilotReady: false, pilotBlockReason: "Mangler readiness", published: 0, measuredEligible: 0, quarantined: 2, liveLearning: false }],
  });

  assert.equal(items[0]?.priority, "critical");
  const summary = summarizeNexusInbox(items);
  assert.deepEqual(summary, { total: 4, critical: 2, approvals: 1, marketing: 2, system: 1 });
});

test("blocked approval stays visible but is not elevated above ready work", () => {
  const items = buildNexusInbox({
    attention: [],
    approvals: [
      { id: "blocked", title: "Presentation", summary: null, ready: false, blocker: "Shortlisten må godkjennes først.", ageDays: 10, customerName: "A", reviewHref: "/lead-intelligence" },
      { id: "ready", title: "Shortlist", summary: "Klar", ready: true, blocker: null, ageDays: 1, customerName: "B", reviewHref: "/lead-intelligence" },
    ],
    marketingRows: [],
  });

  assert.equal(items[0]?.id, "approval:ready");
  assert.equal(items[1]?.blocked, true);
});
