import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContactInteractionEvents,
  buildCustomerProfileCompleteness,
  buildCustomerTimeline,
} from "./customer-360";

test("customer profile completeness combines CRM and approved criteria", () => {
  const result = buildCustomerProfileCompleteness(
    {
      email: "buyer@example.com",
      pipeline_value: 450000,
      property_interest: "Apartment in Albir",
      next_followup: "2026-07-12T09:00:00.000Z",
    },
    [
      { key: "property_type", approval_status: "approved", active: true },
      { key: "bedrooms", approval_status: "approved", active: true },
      { key: "other", other_key: "purchase timeline", approval_status: "approved", active: true },
    ],
  );

  assert.equal(result.score, 100);
  assert.equal(result.missing.length, 0);
});

test("rejected and inactive criteria do not count as complete", () => {
  const result = buildCustomerProfileCompleteness(
    { phone: "+34123456789" },
    [
      { key: "property_type", approval_status: "rejected", active: true },
      { key: "bedrooms", approval_status: "approved", active: false },
    ],
  );

  assert.ok(result.score < 50);
  assert.ok(result.missing.includes("Budsjett"));
  assert.ok(result.missing.includes("Boligtype"));
});

test("contact interactions become normalized timeline events", () => {
  const events = buildContactInteractionEvents([
    { id: "1", type: "email", content: "Customer replied", date: "2026-07-11T10:00:00.000Z", direction: "in" },
    { id: "2", type: "call", content: "Called customer", date: "invalid" },
  ]);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "E-postaktivitet");
  assert.equal(events[0].direction, "in");
});

test("timeline sorting is newest first and deduplicates ids per kind", () => {
  const result = buildCustomerTimeline([
    [{ id: "same", kind: "task", title: "Old task", occurredAt: "2026-07-10T09:00:00.000Z" }],
    [
      { id: "same", kind: "task", title: "Updated task", occurredAt: "2026-07-11T09:00:00.000Z" },
      { id: "portal", kind: "portal", title: "Portal message", occurredAt: "2026-07-12T09:00:00.000Z" },
    ],
  ]);

  assert.equal(result.length, 2);
  assert.equal(result[0].kind, "portal");
  assert.equal(result[1].title, "Updated task");
});
