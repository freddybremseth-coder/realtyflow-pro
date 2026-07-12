import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildRevenueEventDedupeKey,
  insertRevenueEvent,
  normalizeRevenueEvent,
  summarizeRevenueEvents,
} from "@/lib/revenue/events";

function supabaseInsertStub(args: {
  insertResult: { data?: unknown; error?: any };
  existingResult?: { data?: unknown; error?: any };
}) {
  const calls: Array<{ method: string; value?: unknown }> = [];
  const builder = {
    insert(value: unknown) {
      calls.push({ method: "insert", value });
      return builder;
    },
    select(value: unknown) {
      calls.push({ method: "select", value });
      return builder;
    },
    single() {
      calls.push({ method: "single" });
      return Promise.resolve(args.insertResult);
    },
    eq(_column: string, value: unknown) {
      calls.push({ method: "eq", value });
      return builder;
    },
    maybeSingle() {
      calls.push({ method: "maybeSingle" });
      return Promise.resolve(args.existingResult || { data: null, error: null });
    },
  };

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", value: table });
        return builder;
      },
    },
  };
}

test("normalizeRevenueEvent creates a safe database payload", () => {
  const payload = normalizeRevenueEvent({
    eventType: "lead_created",
    contactId: "11111111-1111-1111-1111-111111111111",
    brandId: "zeneco",
    sourceSystem: "public_leads",
    sourceType: "website_form",
    sourceId: "lead-123",
    actorType: "automation",
    confidenceScore: 140,
    revenueImpactEur: 250000,
    dedupeKey: " public-leads:lead-123 ",
    metadata: { source: "zeneco-public" },
    occurredAt: "2026-07-12T10:00:00.000Z",
  });

  assert.equal(payload.event_type, "lead_created");
  assert.equal(payload.title, "Lead opprettet");
  assert.equal(payload.contact_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(payload.brand_id, "zeneco");
  assert.equal(payload.actor_type, "automation");
  assert.equal(payload.confidence_score, 100);
  assert.equal(payload.revenue_impact_eur, 250000);
  assert.equal(payload.dedupe_key, "public-leads:lead-123");
  assert.deepEqual(payload.metadata, { source: "zeneco-public" });
});

test("normalizeRevenueEvent rejects unsupported event types", () => {
  assert.throws(
    () => normalizeRevenueEvent({ eventType: "whatever" as never }),
    /Unsupported revenue event type/,
  );
});

test("buildRevenueEventDedupeKey normalizes stable idempotency keys", () => {
  assert.equal(
    buildRevenueEventDedupeKey(["Public Leads", "Zen Eco", "Lead 123 / A"]),
    "public-leads:zen-eco:lead-123-a",
  );
});

test("summarizeRevenueEvents groups events and revenue impact", () => {
  const summary = summarizeRevenueEvents([
    { event_type: "lead_created", revenue_impact_eur: 1000, occurred_at: "2026-07-10T12:00:00.000Z" },
    { event_type: "lead_created", revenue_impact_eur: "2000", occurred_at: "2026-07-12T12:00:00.000Z" },
    { event_type: "meeting_booked", revenue_impact_eur: null, occurred_at: "2026-07-11T12:00:00.000Z" },
  ]);

  assert.equal(summary.total, 3);
  assert.equal(summary.byType.lead_created, 2);
  assert.equal(summary.byType.meeting_booked, 1);
  assert.equal(summary.revenueImpactEur, 3000);
  assert.equal(summary.latestAt, "2026-07-12T12:00:00.000Z");
});

test("revenue events migration includes RLS, idempotency and non-anon grants", () => {
  const migration = readFileSync(
    "supabase/migrations/20260712183619_revenue_events_foundation.sql",
    "utf8",
  );

  assert.match(migration, /CREATE TABLE IF NOT EXISTS revenue_events/i);
  assert.match(migration, /uniq_revenue_events_dedupe_key/i);
  assert.match(migration, /ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /FOR ALL TO authenticated/i);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE ON revenue_events TO authenticated, service_role/i);
  assert.doesNotMatch(migration, /GRANT .*revenue_events TO anon/i);
});

test("insertRevenueEvent inserts normalized payloads", async () => {
  const mock = supabaseInsertStub({
    insertResult: { data: { id: "event-1" }, error: null },
  });

  const result = await insertRevenueEvent(mock.client, {
    eventType: "lead_created",
    contactId: "11111111-1111-1111-1111-111111111111",
    dedupeKey: "lead-1",
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.deepEqual(result.event, { id: "event-1" });
  assert.equal(mock.calls[0].value, "revenue_events");
  assert.equal((mock.calls.find((call) => call.method === "insert")?.value as any).event_type, "lead_created");
});

test("insertRevenueEvent returns existing row on duplicate dedupe key", async () => {
  const mock = supabaseInsertStub({
    insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
    existingResult: { data: { id: "existing-event" }, error: null },
  });

  const result = await insertRevenueEvent(mock.client, {
    eventType: "meeting_booked",
    dedupeKey: "booking:123",
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, true);
  assert.deepEqual(result.event, { id: "existing-event" });
});

test("insertRevenueEvent reports tableNotReady without throwing", async () => {
  const mock = supabaseInsertStub({
    insertResult: {
      data: null,
      error: { message: "relation revenue_events does not exist" },
    },
  });

  const result = await insertRevenueEvent(mock.client, {
    eventType: "lead_created",
  });

  assert.equal(result.ok, false);
  assert.equal(result.tableNotReady, true);
});
