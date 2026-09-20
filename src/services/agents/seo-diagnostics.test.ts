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

test("all seven connected sites get a concrete check even below GSC opportunity thresholds", () => {
  const data = [
    snapshot("zeneco", 48, 2), snapshot("pinosoecolife", 1, 0),
    snapshot("freddyb", 115, 4), snapshot("freddypublishing", 86, 2),
    snapshot("remasterfreddy", 29, 0), snapshot("donaanna", 0, 0),
    snapshot("chatgenius", 29, 0),
  ];
  const checks = planSEODiagnostics({ snapshots: data, signals: null, leads: null, audits: [] });
  assert.equal(checks.filter(item => item.id.startsWith("check-search-page:")).length, 7);
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

test("art and care get bounded read-only diagnostics without invented Google traffic or private-portal indexing requests", () => {
  const art = { brandId: "freddyart", base: "https://art.freddybremseth.com",
    checkedAt: "2026-09-20T13:00:00Z", home: { status: 200, robotsMeta: null, xRobots: null },
    robots: { googlebotBlocked: false }, observations: [] } as unknown as SiteAudit;
  const care = { brandId: "zenecocare", base: "https://care.zenecohomes.com",
    checkedAt: "2026-09-20T13:00:00Z", home: { status: 200, robotsMeta: "noindex", xRobots: null },
    robots: { googlebotBlocked: false }, observations: [] } as unknown as SiteAudit;
  const checks = planSEODiagnostics({ snapshots: [], signals: null, leads: null, audits: [art, care] });
  const extras = checks.filter(item => ["freddyart", "zenecocare"].includes(item.brandId || ""));
  assert.equal(extras.length, 2);
  assert.ok(extras.every(item => item.needsApproval === false));
  assert.ok(extras.every(item => !/Google Search Console-måling: [0-9]/.test(item.finding)));
  assert.match(extras.find(item => item.brandId === "zenecocare")!.nextStep, /ikke fjern tilsiktet noindex/);
});

test("Freddy Art has separately attributed Google counts without inventing Books or homepage numbers", () => {
  const art = { brandId: "freddyart", base: "https://art.freddybremseth.com",
    checkedAt: "2026-09-20T13:00:00Z",
    home: { status: 200, robotsMeta: null, xRobots: null },
    robots: { googlebotBlocked: false }, observations: [] } as unknown as SiteAudit;
  const checks = planSEODiagnostics({
    snapshots: [snapshot("freddyb", 115, 4), snapshot("freddypublishing", 86, 2), snapshot("freddyart", 19, 2)],
    signals: null, leads: null, audits: [art],
  });
  const artCheck = checks.find(item => item.brandId === "freddyart");
  assert.ok(artCheck);
  assert.match(artCheck.finding, /19 visninger og 2 klikk/);
  assert.match(artCheck.finding, /omfatter ikke bøker eller hovedsiden/);
  assert.deepEqual(checks.filter(item => item.id.startsWith("check-search-page:")).map(item => item.brandId),
    ["freddyb", "freddypublishing"]);
});
