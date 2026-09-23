import test from "node:test";
import assert from "node:assert/strict";
import { planSEODiagnostics } from "./seo-diagnostics";
import type { GSCBrandSnapshot } from "./seo-search-console";
import type { SiteAudit } from "./seo-audit";
import type { SEOLeadSummary } from "./seo-leads";
import type { getSEOObservedSignals } from "./seo-data";

function snapshot(brandId: string, views: number, clicks: number): GSCBrandSnapshot {
  return {
    brandId, connected: true, property: "sc-domain:example.test",
    collectedAt: "2026-09-20T13:00:00Z",
    period: { currentStart: "2026-08-19", currentEnd: "2026-09-17",
      previousStart: "2026-07-20", previousEnd: "2026-08-18" },
    metric: "Google Search Console web Search Analytics; grouped by canonical page",
    totals: { currentClicks: clicks, currentImpressions: views, previousClicks: 0,
      previousImpressions: 0, currentCtr: views ? clicks / views : null, previousCtr: null },
    topPages: [{ path: "/public-guide", clicks, impressions: views, ctr: views ? clicks / views : 0, position: 12 }],
    topQueryPages: [],
    dataQuality: { truncated: false, queryRowsSampled: true, note: "sample" },
  };
}

test("all eight connected search sites get a concrete check even below GSC opportunity thresholds", () => {
  const data = [
    snapshot("zeneco", 48, 2), snapshot("pinosoecolife", 1, 0),
    snapshot("freddyb", 115, 4), snapshot("freddypublishing", 86, 2),
    snapshot("freddyart", 19, 2), snapshot("remasterfreddy", 29, 0), snapshot("donaanna", 0, 0),
    snapshot("chatgenius", 29, 0),
  ];
  const checks = planSEODiagnostics({ snapshots: data, signals: null, leads: null, audits: [] });
  assert.equal(checks.filter(item => item.id.startsWith("check-search-page:")).length, 8);
  assert.ok(checks.every(item => item.needsApproval === false));
  assert.ok(checks.some(item => item.brandId === "donaanna" && item.finding.includes("beviser ikke")));
  assert.ok(checks.some(item => item.brandId === "zeneco" && item.finding.includes("/public-guide")));
  assert.ok(checks.every(item => !/garanter|organiske leads/i.test(item.finding)));
});

test("independent Google clicks and referral arrivals produce measurement checks, not invented conversion rate", () => {
  const signals = {
    totals: { current: 0 },
    dataQuality: { truncated: false },
  } as unknown as Awaited<ReturnType<typeof getSEOObservedSignals>>;
  const leads = { totals: { current: 1 },
    dataQuality: { leadsWithoutPage: 1, leadsWithPage: 0 } } as unknown as SEOLeadSummary;
  const checks = planSEODiagnostics({ snapshots: [snapshot("zeneco", 48, 2)], signals, leads, audits: [] });
  assert.equal(checks[0].id, "check-referral-instrumentation");
  assert.equal(checks[1].id, "check-lead-source-page");
  assert.ok(checks.every(item => item.needsApproval === false));
  assert.ok(checks.every(item => !/konverteringsrate|Google ga oss en lead/i.test(item.finding)));
});

test("technical concerns appear only if actually observed in a bounded public audit", () => {
  const audit = {
    brandId: "zeneco", base: "https://www.zenecohomes.com",
    checkedAt: "2026-09-20T13:00:00Z",
    observations: ["Homepage explicitly returns noindex directive"],
  } as SiteAudit;
  const checks = planSEODiagnostics({ snapshots: [snapshot("zeneco", 48, 2)],
    signals: null, leads: null, audits: [audit] });
  assert.equal(checks.filter(item => item.id === "check-public-audit:zeneco").length, 1);
  assert.match(checks.find(item => item.category === "technical")!.nextStep, /Gjenta HTTP-kontrollen/);
});

test("Care stays technical-only and never becomes an invented Google growth target", () => {
  const care = { brandId: "zenecocare", base: "https://care.zenecohomes.com",
    checkedAt: "2026-09-20T13:00:00Z", home: { status: 200, robotsMeta: "noindex", xRobots: null },
    robots: { googlebotBlocked: false }, observations: [] } as unknown as SiteAudit;
  const checks = planSEODiagnostics({ snapshots: [], signals: null, leads: null, audits: [care] });
  const careCheck = checks.find(item => item.brandId === "zenecocare");
  assert.ok(careCheck);
  assert.equal(careCheck.needsApproval, false);
  assert.match(careCheck.nextStep, /ikke fjern tilsiktet noindex/);
});

test("Freddy Art is a separate Search Console target from Books and the homepage", () => {
  const checks = planSEODiagnostics({
    snapshots: [snapshot("freddyb", 115, 4), snapshot("freddypublishing", 86, 2), snapshot("freddyart", 19, 2)],
    signals: null, leads: null, audits: [],
  });
  const artCheck = checks.find(item => item.id === "check-search-page:freddyart");
  assert.ok(artCheck);
  assert.match(artCheck.finding, /19 målte Google-visninger og 2 klikk/);
  assert.ok(checks.some(item => item.id === "check-search-page:freddyb"));
  assert.ok(checks.some(item => item.id === "check-search-page:freddypublishing"));
});

test("Sam keeps a real same-domain sitemap canonical mismatch in daily technical checks without Google measurements", () => {
  const audit = {
    brandId: "freddypublishing", base: "https://books.freddybremseth.com",
    checkedAt: "2026-09-20T20:00:00Z",
    observations: ["Sitemap sample /book/shadows-of-the-past has a canonical pointing to /; verify whether the declared sitemap URL should be indexed separately"],
  } as SiteAudit;
  const checks = planSEODiagnostics({ snapshots: [], signals: null, leads: null, audits: [audit] });
  const observed = checks.find(item => item.id === "check-public-audit:freddypublishing");
  assert.ok(observed);
  assert.match(observed.finding, /canonical pointing to/);
  assert.equal(observed.needsApproval, false);
  assert.ok(checks.some(item => item.id === "check-google-source:freddypublishing"));
});

test("page hint names the most-impressed returned page, not merely first click-sorted page or site total", () => {
  const snap = snapshot("zeneco", 237, 4);
  snap.topPages = [
    { path: "/en", impressions: 2, clicks: 1, ctr: 0.5, position: 2 },
    { path: "/guide/home-purchase", impressions: 150, clicks: 0, ctr: 0, position: 13 },
  ];
  const result = planSEODiagnostics({ snapshots: [snap], signals: null, leads: null, audits: [] });
  const finding = result.find(item => item.id === "check-search-page:zeneco")!.finding;
  assert.match(finding, /Mest viste side i det returnerte sideuttrekket: \/guide\/home-purchase \(150 visninger \/ 0 klikk\)/);
  assert.match(finding, /ikke nettstedets totalsum/);
  assert.doesNotMatch(finding, /Høyest registrerte side/);
});
