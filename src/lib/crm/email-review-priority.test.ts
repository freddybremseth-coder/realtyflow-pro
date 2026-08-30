import assert from "node:assert/strict";
import test from "node:test";
import { assessEmailLink } from "./email-link-health";
import { classifyEmailIdentityReviewPriorityWithAge } from "./email-review-priority";

const now = new Date("2026-08-30T12:00:00Z");
const contacts = [{ id: "c1", email: "known@example.com", brand_id: "soleada" }];

function review(message: Parameters<typeof assessEmailLink>[0]) {
  return classifyEmailIdentityReviewPriorityWithAge(assessEmailLink(message, contacts), now);
}

test("recent inbound inquiry remains high", () => {
  const result = review({ id: "recent", direction: "inbound", from_address: "new@example.org", ai_intent: "inquiry", received_at: "2026-08-10T12:00:00Z" });
  assert.equal(result.priority, "high");
});

test("31 to 90 day intent-only inbound review becomes medium", () => {
  const result = review({ id: "medium", direction: "inbound", from_address: "new@example.org", ai_intent: "follow_up", received_at: "2026-07-01T12:00:00Z" });
  assert.equal(result.priority, "medium");
  assert.match(result.reason, /eldre intent-only review degraderes til medium/i);
});

test("intent-only inbound review older than 90 days becomes low", () => {
  const result = review({ id: "old", direction: "inbound", from_address: "new@example.org", ai_intent: "follow_up", received_at: "2026-04-19T12:00:00Z" });
  assert.equal(result.priority, "low");
  assert.match(result.reason, /over 90 dager/i);
});

test("missing timestamp stays high rather than being downgraded without evidence", () => {
  assert.equal(review({ id: "unknown-age", direction: "inbound", from_address: "new@example.org", ai_intent: "inquiry" }).priority, "high");
});

test("exact candidate remains high regardless of age", () => {
  const result = review({ id: "exact-old", direction: "inbound", from_address: "known@example.com", ai_intent: "follow_up", received_at: "2025-01-01T00:00:00Z" });
  assert.equal(result.priority, "high");
});

test("identity conflict remains high regardless of age", () => {
  const result = review({ id: "conflict-old", direction: "inbound", from_address: "new@example.org", ai_intent: "follow_up", received_at: "2025-01-01T00:00:00Z", matched_customer_id: "missing" });
  assert.equal(result.priority, "high");
});
