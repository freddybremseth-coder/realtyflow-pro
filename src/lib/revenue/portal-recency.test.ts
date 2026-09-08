import assert from "node:assert/strict";
import test from "node:test";
import { applyPortalRecencyBoost, readPortalRecencySignal } from "./portal-recency";

const NOW = new Date("2026-09-08T10:00:00.000Z");

function sessionEvent(at: string) {
  return {
    event_type: "note",
    source_system: "portal",
    source_type: "portal_session",
    occurred_at: at,
    metadata: { portal_signal: "session_active", hot_lead: false },
  };
}

test("session active within 30 minutes is a small active-now bonus, not a hot-lead action", () => {
  const signal = readPortalRecencySignal([sessionEvent("2026-09-08T09:42:00.000Z")], NOW);
  assert.equal(signal.activeNow, true);
  assert.equal(signal.bonus, 6);
  assert.match(signal.reason || "", /aktiv på Min side nå/i);
});

test("session active between 30 and 120 minutes has only a weak recency bonus", () => {
  const signal = readPortalRecencySignal([sessionEvent("2026-09-08T08:45:00.000Z")], NOW);
  assert.equal(signal.activeNow, false);
  assert.equal(signal.bonus, 3);
  assert.match(signal.reason || "", /nylig aktiv/i);
});

test("stale portal session does not affect revenue priority", () => {
  const signal = readPortalRecencySignal([sessionEvent("2026-09-08T06:00:00.000Z")], NOW);
  assert.equal(signal.activeNow, false);
  assert.equal(signal.bonus, 0);
  assert.equal(signal.reason, null);
});

test("non-session portal events do not masquerade as active-now", () => {
  const signal = readPortalRecencySignal([{
    event_type: "note",
    occurred_at: "2026-09-08T09:55:00.000Z",
    metadata: { portal_signal: "property_interested", hot_lead: true },
  }], NOW);
  assert.equal(signal.bonus, 0);
  assert.equal(signal.activeNow, false);
});

test("recency boost changes score and reason but preserves existing priority and action", () => {
  const item = {
    id: "contact-1",
    contactName: "Buyer",
    email: "buyer@example.com",
    phone: null,
    brandId: "zeneco",
    source: "portal",
    stage: "QUALIFIED",
    value: 500000,
    propertyInterest: "Altea",
    kind: "followup" as const,
    priority: "MEDIUM" as const,
    score: 64,
    reason: "kvalifisert kunde",
    recommendedAction: "Kjør property matching.",
    lastContactAt: null,
    nextFollowupAt: null,
    createdAt: null,
    isOverdue: false,
    isMissingNextAction: true,
    href: "/customers/contact-1",
  };

  const boosted = applyPortalRecencyBoost(item, [sessionEvent("2026-09-08T09:50:00.000Z")], NOW);
  assert.equal(boosted.score, 70);
  assert.equal(boosted.priority, "MEDIUM");
  assert.equal(boosted.recommendedAction, "Kjør property matching.");
  assert.equal(boosted.portalActiveNow, true);
  assert.match(boosted.reason, /aktiv på Min side nå/i);
});
