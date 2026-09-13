import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeJourneyCredit,
  buildContentUtm,
  buildCanonicalLeadAttribution,
  canonicalMetricsForContent,
  rollupContentOutcomes,
  stitchAttributionJourneys,
  touchConfidence,
  touchpointDedupeKey,
  withUtm,
  type Journey,
  type MarketingTouchpoint,
} from "@/lib/marketing/attribution";

const tp = (over: Partial<MarketingTouchpoint>): MarketingTouchpoint => ({ brandId: "zeneco", touchType: "click", occurredAt: "2026-06-01T10:00:00Z", ...over });

test("UTM: utm_content bærer content_id", () => {
  const utm = buildContentUtm({ channel: "instagram", contentId: "ig_483", campaign: "finestrat" });
  assert.equal(utm.utm_content, "ig_483");
  assert.match(withUtm("https://x.no/a", utm), /utm_content=ig_483/);
});

test("confidence: exact når content + identitet finnes", () => {
  assert.equal(touchConfidence(tp({ contentId: "ig_1", contactId: "c1" })), "exact");
  assert.equal(touchConfidence(tp({ contentId: "ig_1" })), "strong");
  assert.equal(touchConfidence(tp({ channel: "instagram", contentId: null })), "probable");
  assert.equal(touchConfidence(tp({ contentId: null, channel: null })), "unknown");
});

test("idempotens: identisk hendelse gir samme dedupe-nøkkel", () => {
  const a = tp({ contactId: "c1", touchType: "sale", contentId: "ig_1", occurredAt: "2026-09-01T12:00:30Z" });
  const b = tp({ contactId: "c1", touchType: "sale", contentId: "ig_1", occurredAt: "2026-09-01T12:00:59Z" });
  assert.equal(touchpointDedupeKey(a), touchpointDedupeKey(b));
});

test("samme kontakt/content i to brands får ulik dedupe-nøkkel", () => {
  const base = { contactId: "c1", touchType: "lead_created" as const, contentId: "ig_1", occurredAt: "2026-09-01T12:00:30Z" };
  assert.notEqual(
    touchpointDedupeKey(tp({ ...base, brandId: "zeneco" })),
    touchpointDedupeKey(tp({ ...base, brandId: "soleada" })),
  );
});

test("exact UTM lead: content-touch + lead_created → 1 lead", () => {
  const j: Journey = { touches: [tp({ contentId: "ig_1", channel: "instagram" }), tp({ touchType: "lead_created" })] };
  const m = rollupContentOutcomes([j], "last_touch").get("ig_1")!;
  assert.equal(m.leads, 1);
});

test("last non-direct: direkte besøk etter kampanje krediterer kampanjen", () => {
  const j: Journey = { touches: [
    tp({ contentId: "ig_1", channel: "instagram", touchType: "click" }),
    tp({ channel: "direct", touchType: "landing", occurredAt: "2026-07-01T10:00:00Z" }),
    tp({ touchType: "sale", commissionEur: 10000, occurredAt: "2026-07-02T10:00:00Z" }),
  ] };
  const m = rollupContentOutcomes([j], "last_touch").get("ig_1")!;
  assert.equal(m.sales, 1);
  assert.equal(m.commissionEur, 10000);
});

test("multi-touch: last_touch krediterer siste, tidligere blir assisted", () => {
  const j: Journey = { touches: [
    tp({ contentId: "ig_1", channel: "instagram", occurredAt: "2026-06-01T10:00:00Z" }),
    tp({ contentId: "yt_1", channel: "youtube", occurredAt: "2026-06-10T10:00:00Z" }),
    tp({ touchType: "sale", commissionEur: 12000, occurredAt: "2026-06-20T10:00:00Z" }),
  ] };
  const map = rollupContentOutcomes([j], "last_touch");
  assert.equal(map.get("yt_1")!.sales, 1);
  assert.equal(map.get("ig_1")!.assistedConversions, 1);
  assert.equal(map.get("ig_1")!.sales, 0);
});

test("linear: kreditt fordeles likt", () => {
  const j: Journey = { touches: [
    tp({ contentId: "a", occurredAt: "2026-06-01T10:00:00Z" }),
    tp({ contentId: "b", occurredAt: "2026-06-05T10:00:00Z" }),
    tp({ touchType: "sale", commissionEur: 10000 }),
  ] };
  const map = rollupContentOutcomes([j], "linear");
  assert.equal(map.get("a")!.sales, 0.5);
  assert.equal(map.get("b")!.commissionEur, 5000);
});

test("organisk lead uten content-touch attribueres ikke", () => {
  const j: Journey = { touches: [tp({ touchType: "lead_created", contentId: null })] };
  assert.equal(rollupContentOutcomes([j], "last_touch").size, 0);
});

test("salg måneder etter content attribueres fortsatt", () => {
  const j: Journey = { touches: [
    tp({ contentId: "ig_1", channel: "instagram", occurredAt: "2026-06-01T10:00:00Z" }),
    tp({ touchType: "sale", commissionEur: 20000, occurredAt: "2026-11-15T10:00:00Z" }),
  ] };
  assert.equal(rollupContentOutcomes([j], "last_touch").get("ig_1")!.sales, 1);
});

test("ingen dobbelttelling: form_submit + lead_created = 1 lead", () => {
  const j: Journey = { touches: [
    tp({ contentId: "web_1", channel: "website", touchType: "form_submit" }),
    tp({ touchType: "lead_created" }),
  ] };
  const m = rollupContentOutcomes([j], "last_touch").get("web_1")!;
  assert.equal(m.leads, 1);
});

test("canonicalMetricsForContent: mates til combineMetrics", () => {
  const j: Journey = { touches: [tp({ contentId: "ig_1", channel: "instagram" }), tp({ touchType: "qualified" })] };
  const c = canonicalMetricsForContent([j], "ig_1", "last_touch");
  assert.equal(c.leads, 1);
  assert.equal(c.qualifiedLeads, 1);
});

test("attributeJourneyCredit: first vs last", () => {
  const touches = [tp({ contentId: "a", occurredAt: "2026-06-01T10:00:00Z" }), tp({ contentId: "b", occurredAt: "2026-06-05T10:00:00Z" })];
  assert.equal(attributeJourneyCredit(touches, "first_touch").primaryContent, "a");
  assert.equal(attributeJourneyCredit(touches, "last_touch").primaryContent, "b");
});

test("identity stitching: anonymous visitor touch joins canonical CRM journey", () => {
  const journeys = stitchAttributionJourneys([
    tp({ touchpointId: "click", visitorId: "visitor-1", contentId: "ig-1" }),
    tp({ touchpointId: "lead", visitorId: "visitor-1", contactId: "contact-1", touchType: "lead_created" }),
  ]);
  assert.equal(journeys.length, 1);
  assert.equal(journeys[0].touches.length, 2);
});

test("identity stitching fails closed for visitor shared by two contacts", () => {
  const journeys = stitchAttributionJourneys([
    tp({ touchpointId: "anonymous", visitorId: "shared", contentId: "ig-1" }),
    tp({ touchpointId: "lead-1", visitorId: "shared", contactId: "contact-1", touchType: "lead_created" }),
    tp({ touchpointId: "lead-2", visitorId: "shared", contactId: "contact-2", touchType: "lead_created" }),
  ]);
  assert.equal(journeys.length, 3);
});

test("identity stitching supports session identity without guessing", () => {
  const journeys = stitchAttributionJourneys([
    tp({ touchpointId: "landing", sessionId: "session-1", contentId: "web-1" }),
    tp({ touchpointId: "lead", sessionId: "session-1", contactId: "contact-1", touchType: "lead_created" }),
  ]);
  assert.equal(journeys.length, 1);
});

test("canonical report follows social lead through CRM sale and dedupes events", () => {
  const report = buildCanonicalLeadAttribution({
    periodStart: "2026-09-01",
    scope: "zeneco",
    touches: [
      tp({ dedupeKey: "click-1", visitorId: "visitor-1", channel: "instagram", campaignId: "autumn", contentId: "ig-1", occurredAt: "2026-08-28T10:00:00Z" }),
      tp({ dedupeKey: "lead-1", visitorId: "visitor-1", contactId: "contact-1", channel: "instagram", campaignId: "autumn", contentId: "ig-1", touchType: "lead_created", occurredAt: "2026-09-02T10:00:00Z" }),
      tp({ dedupeKey: "lead-1", visitorId: "visitor-1", contactId: "contact-1", channel: "instagram", campaignId: "autumn", contentId: "ig-1", touchType: "lead_created", occurredAt: "2026-09-02T10:00:00Z" }),
      tp({ touchpointId: "qualified", contactId: "contact-1", touchType: "qualified", occurredAt: "2026-09-03T10:00:00Z" }),
      tp({ touchpointId: "viewing", contactId: "contact-1", touchType: "viewing", occurredAt: "2026-09-10T10:00:00Z" }),
      tp({ touchpointId: "offer", contactId: "contact-1", touchType: "offer", occurredAt: "2026-10-01T10:00:00Z" }),
      tp({ touchpointId: "sale", contactId: "contact-1", touchType: "sale", commissionEur: 22500, occurredAt: "2026-11-01T10:00:00Z" }),
    ],
  });
  assert.deepEqual(report.summary, {
    leads: 1, qualified: 1, viewings: 1, offers: 1, sales: 1,
    commissionEur: 22500, assistedConversions: 0, attributedLeads: 1, coveragePercent: 100,
  });
  assert.equal(report.channels[0].channel, "instagram");
  assert.equal(report.campaigns[0].campaignId, "autumn");
});

test("canonical last-touch preserves earlier channel as assisted conversion", () => {
  const report = buildCanonicalLeadAttribution({ periodStart: "2026-09-01", touches: [
    tp({ touchpointId: "first", contactId: "c1", contentId: "ig-1", channel: "instagram", occurredAt: "2026-08-20T10:00:00Z" }),
    tp({ touchpointId: "last", contactId: "c1", contentId: "mail-1", channel: "email", occurredAt: "2026-09-01T10:00:00Z" }),
    tp({ touchpointId: "lead", contactId: "c1", contentId: null, channel: null, touchType: "lead_created", occurredAt: "2026-09-02T10:00:00Z" }),
    tp({ touchpointId: "sale", contactId: "c1", contentId: null, channel: null, touchType: "sale", occurredAt: "2026-10-02T10:00:00Z" }),
  ] });
  assert.equal(report.channels.find((row) => row.channel === "email")?.sales, 1);
  assert.equal(report.channels.find((row) => row.channel === "instagram")?.assistedConversions, 1);
});

test("canonical report keeps unknown dimensions explicit", () => {
  const report = buildCanonicalLeadAttribution({ periodStart: "2026-09-01", touches: [
    tp({ touchpointId: "lead", contactId: "c1", contentId: null, channel: "website", touchType: "lead_created", occurredAt: "2026-09-02T10:00:00Z" }),
  ] });
  assert.equal(report.channels[0].campaignId, "all");
  assert.equal(report.channels[0].channel, "website");
  assert.equal(report.campaigns[0].campaignId, "unknown");
});
