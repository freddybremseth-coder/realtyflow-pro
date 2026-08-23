import assert from "node:assert/strict";
import test from "node:test";
import { mergeMetrics, normalizeChannelMetrics, normalizeInstagram, normalizeWebsite, normalizeYoutube } from "@/lib/marketing/analytics";
import { businessValueScore } from "@/lib/marketing/value-score";

test("instagram: saved→saves, website_clicks→clicks, plays→views", () => {
  const m = normalizeInstagram({ plays: 18400, saved: 93, shares: 71, website_clicks: 184, reach: 12300 });
  assert.equal(m.views, 18400);
  assert.equal(m.saves, 93);
  assert.equal(m.shares, 71);
  assert.equal(m.clicks, 184);
});

test("youtube: views + engagedViews + cardClicks→clicks", () => {
  const m = normalizeYoutube({ views: 5000, engagedViews: 2100, shares: 40, cardClicks: 60 });
  assert.equal(m.views, 5000);
  assert.equal(m.engagedViews, 2100);
  assert.equal(m.clicks, 60);
});

test("website: form_submissions→leads", () => {
  const m = normalizeWebsite({ pageviews: 900, cta_clicks: 40, form_submissions: 7 });
  assert.equal(m.views, 900);
  assert.equal(m.clicks, 40);
  assert.equal(m.leads, 7);
});

test("dispatcher velger riktig kanal; ukjent → generic", () => {
  assert.equal(normalizeChannelMetrics("instagram", { plays: 100 }).views, 100);
  assert.equal(normalizeChannelMetrics("tiktok", { views: 50, shares: 3 }).views, 50);
});

test("mergeMetrics: plattform + attribution summeres", () => {
  const platform = normalizeInstagram({ plays: 18400, saved: 93, shares: 71, website_clicks: 184 });
  const business = { leads: 12, qualifiedLeads: 7, viewings: 3, sales: 1, commissionEur: 14500 };
  const merged = mergeMetrics(platform, business);
  assert.equal(merged.views, 18400);
  assert.equal(merged.leads, 12);
  assert.equal(merged.sales, 1);
  // Business value skal nå reflektere hele sløyfen (post→salg).
  assert.ok(businessValueScore(merged) > businessValueScore(platform));
});

test("mergeMetrics: utelater nullfelter", () => {
  const merged = mergeMetrics({ views: 10 }, { leads: 2 });
  assert.equal(merged.views, 10);
  assert.equal(merged.leads, 2);
  assert.equal("shares" in merged, false);
});
