import assert from "node:assert/strict";
import test from "node:test";
import { insertRevenueEvent } from "@/lib/revenue/events";

function makeClient(explicitCommission?: number) {
  const upserts: any[] = [];
  const client: any = {
    from(table: string) {
      if (table === "revenue_events") {
        const b: any = {
          insert: (_payload: any) => b,
          select: (_cols: string) => b,
          single: async () => ({
            data: {
              id: "rev-1",
              event_type: "deal_won",
              brand_id: "zeneco",
              contact_id: "contact-1",
              revenue_impact_eur: 750000,
              occurred_at: "2026-08-25T10:00:00Z",
              source_system: "crm",
              metadata: explicitCommission == null ? {} : { commission_eur: explicitCommission },
            },
            error: null,
          }),
        };
        return b;
      }
      if (table === "marketing_touchpoints") {
        const q: any = {
          select: (_cols: string) => q,
          eq: (_col: string, _value: unknown) => q,
          order: (_col: string, _opts: unknown) => q,
          limit: async (_n: number) => ({
            data: [{
              content_id: "ig-content-1",
              publication_id: "pub-1",
              campaign_id: "camp-1",
              creative_variant_id: null,
              visitor_id: "visitor-1",
              channel: "instagram",
              occurred_at: "2026-08-24T10:00:00Z",
            }],
            error: null,
          }),
          upsert: async (payload: any) => {
            upserts.push(payload);
            return { error: null };
          },
        };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, upserts };
}

test("deal_won mirrors sale to same-brand canonical marketing journey without guessing commission", async () => {
  const mock = makeClient();
  const result = await insertRevenueEvent(mock.client, {
    eventType: "deal_won",
    brandId: "zeneco",
    contactId: "contact-1",
    revenueImpactEur: 750000,
  });

  assert.equal(result.ok, true);
  assert.equal(mock.upserts.length, 1);
  assert.equal(mock.upserts[0].brand_id, "zeneco");
  assert.equal(mock.upserts[0].contact_id, "contact-1");
  assert.equal(mock.upserts[0].content_id, "ig-content-1");
  assert.equal(mock.upserts[0].touch_type, "sale");
  assert.equal(mock.upserts[0].commission_eur, null);
});

test("deal_won uses only explicit commission_eur provenance", async () => {
  const mock = makeClient(22500);
  await insertRevenueEvent(mock.client, {
    eventType: "deal_won",
    brandId: "zeneco",
    contactId: "contact-1",
    revenueImpactEur: 750000,
    metadata: { commission_eur: 22500 },
  });

  assert.equal(mock.upserts.length, 1);
  assert.equal(mock.upserts[0].commission_eur, 22500);
});
