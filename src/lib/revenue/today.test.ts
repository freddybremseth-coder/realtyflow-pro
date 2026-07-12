import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRevenuePriority,
  recommendActionFromRevenueMemory,
  recommendRevenueAction,
  scoreRevenueMemorySignals,
  sortRevenuePriorities,
} from "./today";

const NOW = new Date("2026-07-11T08:00:00.000Z");

test("prioritizes overdue negotiation as critical", () => {
  const item = buildRevenuePriority(
    {
      id: "deal-1",
      name: "Hot Buyer",
      email: "buyer@example.com",
      phone: "+4712345678",
      pipeline_status: "NEGOTIATION",
      pipeline_value: 650_000,
      next_followup: "2026-07-09T09:00:00.000Z",
      last_contact: "2026-07-02T09:00:00.000Z",
      notes: "Customer is discussing reservation and offer.",
      brand_id: "soleada",
    },
    NOW,
  );

  assert.ok(item);
  assert.equal(item.kind, "closing");
  assert.equal(item.priority, "CRITICAL");
  assert.equal(item.isOverdue, true);
  assert.match(item.recommendedAction, /forsinket/i);
  assert.ok(item.score >= 90);
});

test("new lead gets a clear qualification action", () => {
  const item = buildRevenuePriority(
    {
      id: "lead-1",
      name: "New Lead",
      email: "new@example.com",
      pipeline_status: "NEW",
      created_at: "2026-07-10T10:00:00.000Z",
      brand_id: "zeneco",
    },
    NOW,
  );

  assert.ok(item);
  assert.equal(item.kind, "new");
  assert.match(item.recommendedAction, /budsjett/i);
  assert.equal(item.isMissingNextAction, true);
});

test("closed contacts are excluded from the active revenue inbox", () => {
  assert.equal(
    buildRevenuePriority(
      {
        id: "won-1",
        pipeline_status: "WON",
      },
      NOW,
    ),
    null,
  );
});

test("missing contact channels becomes the first recommended action", () => {
  const action = recommendRevenueAction(
    {
      id: "lead-2",
      pipeline_status: "CONTACT",
    },
    NOW,
  );

  assert.match(action, /kontaktkanal/i);
});

test("recent inbound email becomes the recommended next action", () => {
  const action = recommendRevenueAction(
    {
      id: "lead-3",
      email: "buyer@example.com",
      pipeline_status: "CONTACT",
    },
    NOW,
    {
      revenueEvents: [{
        event_type: "email_received",
        title: "E-post mottatt: Vi kan ta en prat",
        occurred_at: "2026-07-10T12:00:00.000Z",
        metadata: { body_preview: "Passer i morgen?" },
      }],
    },
  );

  assert.match(action, /Kunden har svart nylig/i);
  assert.match(action, /svar personlig/i);
});

test("priority cards can use revenue memory for recommended action", () => {
  const item = buildRevenuePriority(
    {
      id: "lead-memory",
      email: "buyer@example.com",
      pipeline_status: "CONTACT",
      next_followup: "2026-07-15T09:00:00.000Z",
    },
    NOW,
    {
      revenueEvents: [{
        event_type: "email_received",
        occurred_at: "2026-07-10T12:00:00.000Z",
        metadata: { body_preview: "Vi er fortsatt interessert." },
      }],
    },
  );

  assert.ok(item);
  assert.match(item.recommendedAction, /Kunden har svart nylig/i);
  assert.ok(item.score >= 50);
  assert.match(item.reason, /kunden svarte nylig/i);
});

test("revenue memory score promotes fresh buying signals and explains why", () => {
  const memory = scoreRevenueMemorySignals(
    [
      {
        event_type: "email_received",
        occurred_at: "2026-07-10T12:00:00.000Z",
        metadata: { body_preview: "Vi er klar for visning og kan reise neste uke." },
      },
      {
        event_type: "meeting_booked",
        occurred_at: "2026-07-09T12:00:00.000Z",
      },
    ],
    NOW,
  );

  assert.ok(memory.score >= 30);
  assert.ok(memory.reasons.includes("kunden svarte nylig"));
  assert.ok(memory.reasons.includes("møte er booket"));
  assert.ok(memory.reasons.includes("sterkt kjøpssignal i kundeminne"));
});

test("negative revenue memory reduces the signal score", () => {
  const memory = scoreRevenueMemorySignals(
    [{
      event_type: "email_received",
      occurred_at: "2026-07-10T12:00:00.000Z",
      metadata: { body_preview: "Stopp, dette er ikke aktuelt lenger." },
    }],
    NOW,
  );

  assert.ok(memory.score < 0);
  assert.ok(memory.reasons.includes("negativt signal i kundeminne"));
});

test("booked meeting memory prepares the advisor for the call", () => {
  const action = recommendActionFromRevenueMemory(
    [{
      event_type: "meeting_booked",
      title: "Ny booking",
      occurred_at: "2026-07-05T12:00:00.000Z",
    }],
    NOW,
  );

  assert.match(action || "", /Møte er booket/i);
  assert.match(action || "", /3–5 relevante boliger/i);
});

test("sent follow-up without a reply recommends a personal check-in", () => {
  const action = recommendActionFromRevenueMemory(
    [{
      event_type: "message_sent",
      title: "E-post sendt: Her er forslag",
      occurred_at: "2026-07-06T12:00:00.000Z",
      description: "Sendt til buyer@example.com",
    }],
    NOW,
  );

  assert.match(action || "", /uten registrert svar/i);
});

test("sorting prefers critical and higher-scoring opportunities", () => {
  const low = buildRevenuePriority(
    {
      id: "low",
      name: "Low",
      email: "low@example.com",
      pipeline_status: "CONTACT",
      next_followup: "2026-07-20T09:00:00.000Z",
    },
    NOW,
  );
  const critical = buildRevenuePriority(
    {
      id: "critical",
      name: "Critical",
      email: "critical@example.com",
      phone: "+34123456789",
      pipeline_status: "NEGOTIATION",
      pipeline_value: 900_000,
      next_followup: "2026-07-10T09:00:00.000Z",
      notes: "Ready for reservation",
    },
    NOW,
  );

  assert.ok(low && critical);
  const sorted = sortRevenuePriorities([low, critical]);
  assert.equal(sorted[0].id, "critical");
  assert.ok(critical.score >= low.score);
});
