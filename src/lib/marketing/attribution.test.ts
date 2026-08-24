import assert from "node:assert/strict";
import test from "node:test";
import {
  attributeJourneyCredit,
  buildContentUtm,
  canonicalMetricsForContent,
  rollupContentOutcomes,
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
