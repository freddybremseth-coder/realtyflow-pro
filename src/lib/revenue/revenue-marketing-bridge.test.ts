import assert from "node:assert/strict";
import test from "node:test";
import { insertRevenueEvent, type RevenueEventType } from "@/lib/revenue/events";

function makeClient(opts: {
  eventType?: RevenueEventType;
  explicitCommission?: number;
  sourceSystem?: string;
  metadata?: Record<string, unknown>;
  verifiedPublication?: boolean;
} = {}) {
  const upserts: any[] = [];
  const eventType = opts.eventType ?? "deal_won";
  const client: any = {
    from(table: string) {
      if (table === "revenue_events") {
        const b: any = {
          insert: (_payload: any) => b,
          select: (_cols: string) => b,
          single: async () => ({
            data: {
              id: `rev-${eventType}`,
              event_type: eventType,
              brand_id: "zeneco",
              contact_id: "contact-1",
              revenue_impact_eur: eventType === "deal_won" ? 750000 : null,
              occurred_at: "2026-08-25T10:00:00Z",
              source_system: opts.sourceSystem ?? "crm",
              metadata: { ...(opts.metadata ?? {}), ...(opts.explicitCommission == null ? {} : { commission_eur: opts.explicitCommission }) },
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
      if (table === "marketing_publications") {
        const q: any = {
          select: (_cols: string) => q,
          eq: (_col: string, _value: unknown) => q,
          maybeSingle: async () => ({
            data: opts.verifiedPublication ? {
              publication_id: "pub-verified",
              brand_id: "zeneco",
              content_id: "ig-content-verified",
              campaign_id: "camp-verified",
              channel: "instagram",
            } : null,
            error: null,
          }),
        };
        return q;
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client, upserts };
}

async function mirror(eventType: RevenueEventType, opts: { explicitCommission?: number; sourceSystem?: string; metadata?: Record<string, unknown>; verifiedPublication?: boolean } = {}) {
  const mock = makeClient({ eventType, ...opts });
  const outcomeEvidence = eventType === "qualified"
    ? { next_status: "QUALIFIED" }
    : eventType === "deal_won"
      ? { next_status: "WON" }
      : {};
  const result = await insertRevenueEvent(mock.client, {
    eventType,
    brandId: "zeneco",
    contactId: "contact-1",
    sourceSystem: opts.sourceSystem ?? "crm",
    sourceType: "test_outcome",
    sourceId: `source-${eventType}`,
    dedupeKey: `test:${eventType}`,
    revenueImpactEur: eventType === "deal_won" ? 750000 : null,
    metadata: { ...outcomeEvidence, ...(opts.metadata ?? {}), ...(opts.explicitCommission == null ? {} : { commission_eur: opts.explicitCommission }) },
  });
  assert.equal(result.ok, true);
  return mock.upserts;
}

test("qualified mirrors only an explicit qualified revenue event", async () => {
  const upserts = await mirror("qualified");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].touch_type, "qualified");
  assert.equal(upserts[0].brand_id, "zeneco");
  assert.equal(upserts[0].contact_id, "contact-1");
});

test("viewing_completed mirrors a canonical viewing", async () => {
  const upserts = await mirror("viewing_completed");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].touch_type, "viewing");
  assert.equal(upserts[0].content_id, "ig-content-1");
});

test("offer_made mirrors a canonical offer", async () => {
  const upserts = await mirror("offer_made");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].touch_type, "offer");
  assert.equal(upserts[0].content_id, "ig-content-1");
});

test("deal_won mirrors sale to same-brand canonical journey without guessing commission", async () => {
  const upserts = await mirror("deal_won");
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].brand_id, "zeneco");
  assert.equal(upserts[0].contact_id, "contact-1");
  assert.equal(upserts[0].content_id, "ig-content-1");
  assert.equal(upserts[0].touch_type, "sale");
  assert.equal(upserts[0].commission_eur, null);
});

test("deal_won uses only explicit commission_eur provenance", async () => {
  const upserts = await mirror("deal_won", { explicitCommission: 22500 });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].commission_eur, 22500);
});

test("generic contact_updated does not invent a funnel outcome", async () => {
  const upserts = await mirror("contact_updated", { sourceSystem: "crm_pipeline" });
  assert.equal(upserts.length, 0);
});

test("public lead preserves explicit UTM and visitor/session without requiring content", async () => {
  const upserts = await mirror("lead_created", {
    sourceSystem: "public_leads",
    metadata: {
      utm_source: "facebook",
      utm_medium: "social",
      utm_campaign: "autumn-villas",
      visitor_id: "visitor-1",
      session_id: "session-1",
    },
  });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].touch_type, "lead_created");
  assert.equal(upserts[0].content_id, null);
  assert.equal(upserts[0].campaign_id, "autumn-villas");
  assert.equal(upserts[0].channel, "facebook");
  assert.equal(upserts[0].visitor_id, "visitor-1");
  assert.equal(upserts[0].metadata.session_id, "session-1");
  assert.equal(upserts[0].confidence, "strong");
});

test("publication attribution is accepted only through a same-brand publication lookup", async () => {
  const upserts = await mirror("lead_created", {
    verifiedPublication: true,
    metadata: { publication_id: "pub-verified", visitor_id: "visitor-1" },
  });
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0].publication_id, "pub-verified");
  assert.equal(upserts[0].content_id, "ig-content-verified");
  assert.equal(upserts[0].campaign_id, "camp-verified");
  assert.equal(upserts[0].metadata.attribution_context, "verified_publication");
  assert.equal(upserts[0].confidence, "exact");
});
