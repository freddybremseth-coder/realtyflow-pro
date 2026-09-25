import test from "node:test";
import assert from "node:assert/strict";
import { runSEOControls } from "./seo-controls";
import { auditOneSite, SEO_AUDIT_TARGETS } from "./seo-audit";
import { buildSEOControlReport } from "./seo-control-report";
import type { GSCBrandSnapshot } from "./seo-search-console";
import type { getSEOObservedSignals } from "./seo-data";
import type { SEOLeadSummary } from "./seo-leads";

const signals = { totals: { current: 0 } } as Awaited<ReturnType<typeof getSEOObservedSignals>>;
const leads = { dataQuality: { leadsWithoutPage: 0 } } as SEOLeadSummary;
const snapshot = { brandId: "zeneco", property: "https://www.zenecohomes.com/", topPages: [],
  totals: { currentClicks: 2, currentImpressions: 10 },
  period: { currentStart: "2026-08-01", currentEnd: "2026-08-30" },
} as unknown as GSCBrandSnapshot;

test("shared daily/manual controls actually run preflight and retain results", async () => {
  let calls = 0;
  const result = await runSEOControls([snapshot], {
    signals: async () => signals, leads: async () => leads, audits: async () => [],
    preflight: async () => { calls++; return [{ brandId: "zeneco", status: "blocked", evidence: "HTTP 403" }]; },
  });
  assert.equal(calls, 1);
  assert.equal(result.controlReport.collector?.blocked, 1);
  assert.match(result.diagnostics.find(item => item.id === "check-referral-instrumentation")!.finding, /zeneco/);
  assert.equal(result.controlReport.leadsAvailable, true);
});

test("unavailable arrivals are not zero visits and must not trigger zero-arrival preflight", async () => {
  const result = await runSEOControls([snapshot], {
    signals: async () => { throw new Error("unavailable"); },
    leads: async () => { throw new Error("unavailable"); }, audits: async () => [],
    preflight: async () => { assert.fail("Should not run without measured arrivals"); },
  });
  assert.equal(result.controlReport.referralsAvailable, false);
  assert.equal(result.controlReport.leadsAvailable, false);
  assert.equal(result.controlReport.collector, null);
  assert.ok(result.diagnostics.some(item => item.brandId === "zeneco"));
});

test("failed HTTP audits never count as checked pages or a healthy site", async () => {
  const audit = await auditOneSite(SEO_AUDIT_TARGETS[0], async () => { throw new Error("offline"); });
  const report = buildSEOControlReport({ audits: [audit], referralsAvailable: false,
    leadsAvailable: false, collectorPreflight: null });
  assert.equal(report.sites[0].pagesChecked, 0);
  assert.equal(report.sites[0].qualityPagesChecked, 0);
  assert.equal(report.sites[0].incomplete, true);
});

test("HTML quality defects are actionable observations even without any Google data", async () => {
  const audit = await auditOneSite(SEO_AUDIT_TARGETS[0], async url => ({
    url, status: 200, contentType: "text/html", xRobots: "",
    body: '<html><title>Home</title><h1>Home</h1><img src="house"><script type="application/ld+json">{broken}</script></html>',
  }));
  const result = await runSEOControls([], {
    signals: async () => signals, leads: async () => leads, audits: async () => [audit],
    preflight: async () => { assert.fail("No Google clicks"); },
  });
  assert.equal(result.controlReport.sites[0].accessibilityFindings, 3);
  assert.equal(result.controlReport.sites[0].invalidStructuredData, 1);
  const issue = result.diagnostics.find(item => item.id === "check-page-quality:zeneco:/");
  assert.ok(issue);
  assert.match(issue.finding, /ikke rettet/);
  assert.equal(issue.needsApproval, false);
});
