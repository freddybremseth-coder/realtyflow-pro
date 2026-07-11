import assert from "node:assert/strict";
import test from "node:test";
import { buildAfterSalesCustomer, sortAfterSalesCustomers } from "./after-sales";

const now = new Date("2026-07-11T10:00:00.000Z");

function contact(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Test Customer",
    email: "customer@example.com",
    phone: "+34123456789",
    pipeline_status: "WON",
    pipeline_value: 500_000,
    brand_id: "zeneco",
    updated_at: "2026-06-01T10:00:00.000Z",
    last_contact: "2026-06-01T10:00:00.000Z",
    interactions: [],
    ...overrides,
  };
}

test("ignores contacts that are not won customers", () => {
  assert.equal(buildAfterSalesCustomer(contact({ pipeline_status: "NEGOTIATION" }), now), null);
});

test("newly won customer starts with onboarding actions", () => {
  const result = buildAfterSalesCustomer(contact({ updated_at: "2026-07-06T10:00:00.000Z" }), now);
  assert.ok(result);
  assert.equal(result.phase, "ONBOARDING");
  assert.ok(result.dueActions.includes("welcome_checkin"));
  assert.equal(result.opportunities.find((item) => item.id === "referral_request")?.due, false);
});

test("established customer becomes ready for review, care and referral", () => {
  const result = buildAfterSalesCustomer(contact({ updated_at: "2026-04-01T10:00:00.000Z" }), now);
  assert.ok(result);
  assert.equal(result.phase, "RELATIONSHIP");
  assert.ok(result.dueActions.includes("care_offer"));
  assert.ok(result.dueActions.includes("review_request"));
  assert.ok(result.dueActions.includes("referral_request"));
});

test("completed internal actions are suppressed from due actions", () => {
  const result = buildAfterSalesCustomer(contact({
    updated_at: "2026-04-01T10:00:00.000Z",
    interactions: [
      { type: "after_sales", action: "review_request", content: "Omtale forespurt" },
      { type: "after_sales", metadata: { action: "referral_request" }, content: "Anbefaling forespurt" },
    ],
  }), now);
  assert.ok(result);
  assert.ok(!result.dueActions.includes("review_request"));
  assert.ok(!result.dueActions.includes("referral_request"));
  assert.ok(result.completedActions.includes("review_request"));
});

test("overdue high-value customer receives high priority", () => {
  const result = buildAfterSalesCustomer(contact({
    pipeline_value: 900_000,
    updated_at: "2025-06-01T10:00:00.000Z",
    last_contact: "2025-12-01T10:00:00.000Z",
    next_followup: "2026-06-20T10:00:00.000Z",
  }), now);
  assert.ok(result);
  assert.equal(result.priority, "HIGH");
  assert.equal(result.isOverdue, true);
  assert.match(result.recommendedAction, /forsinket/i);
});

test("Pinoso customers receive rural care wording", () => {
  const result = buildAfterSalesCustomer(contact({
    brand_id: "pinosoecolife",
    updated_at: "2026-04-01T10:00:00.000Z",
  }), now);
  assert.ok(result);
  assert.match(result.opportunities.find((item) => item.id === "care_offer")?.label || "", /tomtetilsyn/i);
});

test("sorting prioritizes high urgency before value", () => {
  const high = buildAfterSalesCustomer(contact({
    id: "11111111-1111-4111-8111-111111111112",
    pipeline_value: 200_000,
    updated_at: "2025-01-01T10:00:00.000Z",
    next_followup: "2026-06-01T10:00:00.000Z",
  }), now);
  const low = buildAfterSalesCustomer(contact({
    id: "11111111-1111-4111-8111-111111111113",
    pipeline_value: 1_000_000,
    updated_at: "2026-07-09T10:00:00.000Z",
    last_contact: "2026-07-10T10:00:00.000Z",
    next_followup: "2026-08-01T10:00:00.000Z",
  }), now);
  assert.ok(high && low);
  assert.equal(sortAfterSalesCustomers([low, high])[0].id, high.id);
});
