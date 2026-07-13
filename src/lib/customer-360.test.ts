import assert from "node:assert/strict";
import test from "node:test";
import {
  buildContactInteractionEvents,
  buildCustomerProfileCompleteness,
  buildCustomerTimeline,
  buildRevenueTimelineEvents,
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

test("revenue events become customer timeline memory with direction", () => {
  const events = buildRevenueTimelineEvents([
    {
      id: "inbound-1",
      event_type: "email_received",
      title: "E-post mottatt: Book møte",
      actor_type: "customer",
      occurred_at: "2026-07-12T12:00:00.000Z",
      metadata: { body_preview: "Kan vi ta en prat?" },
    },
    {
      id: "sent-1",
      event_type: "message_sent",
      title: "E-post sendt: Her er forslag",
      actor_type: "human",
      occurred_at: "2026-07-12T11:00:00.000Z",
      description: "Sendt til buyer@example.com",
    },
    {
      id: "fallback-1",
      event_type: "nurture_step_sent",
      actor_type: "automation",
      occurred_at: "2026-07-12T10:00:00.000Z",
    },
  ]);

  assert.equal(events.length, 3);
  assert.equal(events[0].kind, "revenue");
  assert.equal(events[0].direction, "in");
  assert.equal(events[0].detail, "Kan vi ta en prat?");
  assert.equal(events[1].direction, "out");
  assert.equal(events[1].detail, "Sendt til buyer@example.com");
  assert.equal(events[2].title, "Nurture-steg sendt");
  assert.equal(events[2].direction, "out");
});

test("revenue timeline explains portal preference and property PDF memory", () => {
  const events = buildRevenueTimelineEvents([
    {
      id: "prefs-1",
      event_type: "contact_updated",
      title: "Kunden oppdaterte boligønsker på Min side",
      source_type: "preferences_updated",
      actor_type: "customer",
      occurred_at: "2026-07-12T12:00:00.000Z",
      metadata: { summary: "Budsjett til: 550000\nOmråde/sted: Altea" },
    },
    {
      id: "pdf-1",
      event_type: "message_sent",
      title: "E-post sendt: Eiendomsprospekt",
      source_type: "single_property_pdf",
      actor_type: "human",
      occurred_at: "2026-07-12T11:00:00.000Z",
      metadata: {
        property_title: "Villa Altea",
        primary_recipient: "buyer@example.com",
        filename: "villa-altea-prospekt.pdf",
      },
    },
    {
      id: "report-1",
      event_type: "note",
      title: "Rapport publisert på Min side",
      source_type: "market_report_published",
      actor_type: "system",
      occurred_at: "2026-07-12T10:00:00.000Z",
      metadata: { report_title: "Markedspuls Costa Blanca" },
    },
  ]);

  assert.equal(events[0].detail, "Budsjett til: 550000\nOmråde/sted: Altea");
  assert.equal(events[0].direction, "in");
  assert.equal(events[1].detail, "Prospekt: Villa Altea · til buyer@example.com · villa-altea-prospekt.pdf");
  assert.equal(events[1].direction, "out");
  assert.equal(events[2].detail, "Markedspuls Costa Blanca");
});
