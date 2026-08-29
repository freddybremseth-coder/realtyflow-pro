import assert from "node:assert/strict";
import test from "node:test";
import { buildLinkedEmailTimelineEvents, buildNurtureTimelineEvents } from "./customer-communication-timeline";

test("dry-run nurture is internal and explicitly not sent", () => {
  const events = buildNurtureTimelineEvents([{
    id: "dry-1",
    sequence_id: "soleada-reactivation-v1",
    step_id: "reconnect",
    channel: "email",
    subject: "Er bolig i Spania fortsatt aktuelt for deg?",
    status: "dry_run",
    dry_run: true,
    scheduled_for: "2026-08-29T10:00:00.000Z",
    created_at: "2026-08-29T09:59:00.000Z",
  }]);

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Nurture-plan – ikke sendt");
  assert.equal(events[0].direction, "internal");
  assert.match(String(events[0].detail), /Er bolig i Spania fortsatt aktuelt for deg\?/);
});

test("successful real nurture send is outbound", () => {
  const events = buildNurtureTimelineEvents([{
    id: "sent-1",
    channel: "email",
    subject: "Oppfølging",
    status: "sent",
    dry_run: false,
    sent_at: "2026-08-29T10:00:00.000Z",
  }]);

  assert.equal(events[0].title, "Nurture-e-post sendt");
  assert.equal(events[0].direction, "out");
});

test("failed nurture send never appears as sent", () => {
  const events = buildNurtureTimelineEvents([{
    id: "failed-1",
    channel: "email",
    status: "failed",
    dry_run: false,
    error: "SMTP unavailable",
    sent_at: "2026-08-29T10:00:00.000Z",
  }]);

  assert.equal(events[0].title, "Nurture-send feilet");
  assert.equal(events[0].direction, "internal");
  assert.match(String(events[0].detail), /SMTP unavailable/);
});

test("explicitly linked inbound email becomes customer timeline memory", () => {
  const events = buildLinkedEmailTimelineEvents([{
    id: "mail-in-1",
    direction: "inbound",
    subject: "Visning neste uke",
    ai_intent: "follow_up",
    ai_urgency: "high",
    matched_lead_id: "contact-1",
    received_at: "2026-08-29T10:00:00.000Z",
  }]);

  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "in");
  assert.equal(events[0].title, "E-post mottatt: Visning neste uke");
  assert.match(String(events[0].detail), /Intent: follow_up/);
  assert.match(String(events[0].detail), /Haster: high/);
});

test("explicitly linked outbound email is marked outbound", () => {
  const events = buildLinkedEmailTimelineEvents([{
    id: "mail-out-1",
    direction: "outbound",
    subject: "Boligforslag",
    matched_customer_id: "contact-2",
    created_at: "2026-08-29T09:00:00.000Z",
  }]);

  assert.equal(events.length, 1);
  assert.equal(events[0].direction, "out");
  assert.equal(events[0].title, "E-post sendt: Boligforslag");
});

test("unlinked email is excluded even if it has a valid timestamp", () => {
  const events = buildLinkedEmailTimelineEvents([{
    id: "mail-unlinked",
    direction: "inbound",
    subject: "Should not appear",
    received_at: "2026-08-29T10:00:00.000Z",
  }]);

  assert.equal(events.length, 0);
});
