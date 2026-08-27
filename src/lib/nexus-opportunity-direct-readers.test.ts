import assert from "node:assert/strict";
import test from "node:test";
import {
  aiDemositesOpportunityPayloadFromRows,
  realEstateOpportunityPayloadFromRows,
} from "@/lib/nexus-opportunity-direct-readers";

test("direct real-estate shaping reuses Revenue Today priority logic and contact revenue memory", () => {
  const now = new Date("2026-08-27T06:00:00.000Z");
  const payload = realEstateOpportunityPayloadFromRows([
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Test Buyer",
      email: "buyer@example.com",
      pipeline_status: "QUALIFIED",
      pipeline_value: 450000,
      brand_id: "zeneco",
      created_at: "2026-08-20T10:00:00.000Z",
      updated_at: "2026-08-27T05:30:00.000Z",
    },
  ], [
    {
      contact_id: "11111111-1111-4111-8111-111111111111",
      event_type: "email_received",
      title: "Svar fra kunde",
      occurred_at: "2026-08-27T05:00:00.000Z",
      metadata: {},
    },
  ], now);

  assert.equal(payload.priorities.length, 1);
  assert.equal(payload.priorities[0].id, "11111111-1111-4111-8111-111111111111");
  assert.equal(payload.priorities[0].stage, "QUALIFIED");
  assert.match(payload.priorities[0].recommendedAction, /Kunden har svart nylig/i);
});

test("direct DemoSites shaping preserves canonical orders and events for the existing AI adapter", () => {
  const orders = [{ id: "order_1", status: "in_setup", company_name: "ACME", currency: "NOK" }];
  const events = [{ order_id: "order_1", event_type: "demo_inquiry", created_at: "2026-08-27T05:00:00.000Z" }];
  const payload = aiDemositesOpportunityPayloadFromRows(orders, events);

  assert.equal(payload.orders, orders);
  assert.equal(payload.events, events);
  assert.equal(payload.orders[0].id, "order_1");
  assert.equal(payload.events[0].event_type, "demo_inquiry");
});
