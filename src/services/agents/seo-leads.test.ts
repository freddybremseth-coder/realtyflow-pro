import test from "node:test";
import assert from "node:assert/strict";
import { publicLeadPage, summarizeSEOLeads } from "./seo-leads";
import { planSEOOpportunities } from "./seo-opportunities";
import type { SiteAudit } from "./seo-audit";
import type { getSEOObservedSignals } from "./seo-data";

const DAY = 86400000;
const NOW = Date.UTC(2026, 8, 19);

test("public source URL removes all query data and rejects external/personal targets", () => {
  assert.equal(publicLeadPage("https://www.zenecohomes.com/eiendommer/N42?email=user@example.com&utm_source=google", "zeneco"), "/eiendommer/N42");
  assert.equal(publicLeadPage("https://evil.invalid/phish?email=test", "zeneco"), null);
  assert.equal(publicLeadPage("https://www.zenecohomes.com/private#token=abcd", "pinosoecolife"), null);
  assert.equal(publicLeadPage("javascript:alert(1)", "zeneco"), null);
  assert.equal(publicLeadPage("https://art.freddybremseth.com/verk/example?buyer=private", "freddyart"), "/verk/example");
  assert.equal(publicLeadPage("https://books.freddybremseth.com/book/example", "freddyart"), null);
});

test("lead summary separates source page coverage, brands and 30-day windows", () => {
  const result = summarizeSEOLeads([
    { brand_id: "zeneco", created_at: new Date(NOW - DAY).toISOString(), page_url: "" },
    { brand_id: "zeneco", created_at: new Date(NOW - 2 * DAY).toISOString(), page_url: "https://www.zenecohomes.com/eiendommer/N42?email=private" },
    { brand_id: "pinosoecolife", created_at: new Date(NOW - 42 * DAY).toISOString(), page_url: "https://www.pinosoecolife.com/" },
    { brand_id: "unknown", created_at: new Date(NOW - DAY).toISOString(), page_url: "https://unknown.tld/" },
  ], NOW);
  assert.equal(result.totals.current, 2);
  assert.equal(result.totals.previous, 1);
  assert.equal(result.dataQuality.leadsWithPage, 1);
  assert.equal(result.dataQuality.leadsWithoutPage, 1);
  assert.deepEqual(result.topLeadPages, [{ brandId: "zeneco", path: "/eiendommer/N42", inquiries: 1 }]);
  assert.ok(!JSON.stringify(result).includes("private"));
});

function signalStub() {
  return {
    totals: { current: 0, previous: 0, search: 0, ai: 0, changePercent: null },
    dataQuality: { truncated: false },
    byBrand: [{ brandId: "zeneco", current: 0 }],
  } as unknown as Awaited<ReturnType<typeof getSEOObservedSignals>>;
}

test("SEO opportunities are evidence-based, review-only and avoid false organic lead attribution", () => {
  const leads = summarizeSEOLeads([
    { brand_id: "zeneco", created_at: new Date(NOW - DAY).toISOString(), page_url: null },
  ], NOW);
  const opportunities = planSEOOpportunities(signalStub(), leads, [] as SiteAudit[]);
  assert.equal(opportunities.length, 2);
  assert.equal(opportunities[0].issueId, "portfolio-referrer-instrumentation");
  assert.equal(opportunities[1].issueId, "source-page-attribution:zeneco");
  assert.ok(opportunities.every(item => !/verified organic leads|Google generated/i.test(item.description)));
});
