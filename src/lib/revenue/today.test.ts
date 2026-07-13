import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRecommendedRevenuePlay,
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

test("portal preference updates recommend matching homes against the new profile", () => {
  const action = recommendActionFromRevenueMemory(
    [{
      event_type: "contact_updated",
      source_system: "portal",
      source_type: "preferences_updated",
      title: "Kunden oppdaterte boligønsker på Min side",
      description: "Budsjett til: 550000\nOmråde/sted: Altea\nTidslinje: Innen 3 mnd",
      occurred_at: "2026-07-10T12:00:00.000Z",
      metadata: { property_interest: "Altea / Villa" },
    }],
    NOW,
  );

  assert.match(action || "", /oppdaterte boligønsker/i);
  assert.match(action || "", /Match 3–5 boliger/i);
});

test("fresh portal messages become high-confidence revenue memory signals", () => {
  const item = buildRevenuePriority(
    {
      id: "portal-message",
      name: "Portal Buyer",
      email: "portal@example.com",
      pipeline_status: "CONTACT",
      pipeline_value: 400_000,
      next_followup: "2026-07-15T09:00:00.000Z",
    },
    NOW,
    {
      revenueEvents: [{
        event_type: "note",
        source_system: "portal",
        source_type: "customer_message",
        title: "Kundemelding på Min side",
        description: "Kan vi se disse boligene neste uke?",
        occurred_at: "2026-07-10T12:00:00.000Z",
      }],
    },
  );

  assert.ok(item);
  assert.equal(item.priority, "HIGH");
  assert.match(item.recommendedAction, /skrevet på Min side/i);
  assert.match(item.reason, /kundemelding på Min side/i);
});

test("property PDF sends create a concrete prospect follow-up signal", () => {
  const memory = scoreRevenueMemorySignals(
    [{
      event_type: "message_sent",
      source_system: "property_pdf",
      source_type: "single_property_pdf",
      title: "E-post sendt: Eiendomsprospekt",
      occurred_at: "2026-07-09T12:00:00.000Z",
      metadata: { property_title: "Villa Altea", filename: "villa-prospekt.pdf" },
    }],
    NOW,
  );
  const action = recommendActionFromRevenueMemory(
    [{
      event_type: "message_sent",
      source_system: "property_pdf",
      source_type: "single_property_pdf",
      title: "E-post sendt: Eiendomsprospekt",
      occurred_at: "2026-07-09T12:00:00.000Z",
    }],
    NOW,
  );

  assert.ok(memory.score >= 12);
  assert.ok(memory.reasons.includes("konkret prospekt sendt"));
  assert.match(action || "", /konkret prospekt/i);
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

test("recommended revenue play chooses the most urgent customer action", () => {
  const critical = buildRevenuePriority(
    {
      id: "deal-critical",
      name: "Critical Buyer",
      email: "critical@example.com",
      pipeline_status: "NEGOTIATION",
      pipeline_value: 800_000,
      next_followup: "2026-07-09T09:00:00.000Z",
      brand_id: "soleada",
    },
    NOW,
  );

  assert.ok(critical);
  const play = buildRecommendedRevenuePlay([critical], [{
    id: "task-1",
    title: "Sjekk portalpreferanser",
    priority: "HIGH",
    aiScore: 80,
    href: "/today",
  }]);

  assert.ok(play);
  assert.equal(play.source, "customer_priority");
  assert.equal(play.title, "Følg opp Critical Buyer");
  assert.equal(play.priority, "CRITICAL");
  assert.match(play.primaryAction, /forsinket/i);
});

test("recommended revenue play can choose a stronger open sales task", () => {
  const medium = buildRevenuePriority(
    {
      id: "lead-medium",
      name: "Medium Buyer",
      email: "medium@example.com",
      pipeline_status: "CONTACT",
      pipeline_value: 150_000,
      next_followup: "2026-07-14T09:00:00.000Z",
      brand_id: "zeneco",
    },
    NOW,
  );

  assert.ok(medium);
  const play = buildRecommendedRevenuePlay([medium], [{
    id: "task-2",
    title: "Match nye portalønsker",
    priority: "HIGH",
    nextAction: "Finn 3 aktuelle boliger og lag shortlist.",
    aiScore: 88,
    href: "/lead-intelligence",
  }]);

  assert.ok(play);
  assert.equal(play.source, "work_item");
  assert.equal(play.title, "Match nye portalønsker");
  assert.match(play.primaryAction, /shortlist/i);
  assert.equal(play.href, "/lead-intelligence");
});
