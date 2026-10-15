import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisibilityOverview } from "./visibility-overview";
import type { SEOControlReport } from "@/services/agents/seo-control-report";

test("legacy stored reports without visibilityDiagnostic render a safe refresh notice", () => {
  const report = {
    checkedAt: "2026-10-15T00:00:00.000Z",
    sites: [{
      brandId: "zeneco", checkedAt: "2026-10-15T00:00:00.000Z",
      pagesChecked: 3, findings: 0, incomplete: false,
    }],
  } as unknown as SEOControlReport;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report }));
  assert.match(html, /Krever ny kontroll/);
  assert.match(html, /Rapporten ble lagret før Visibility-kontrollen/);
  assert.doesNotMatch(html, /Ingen blokkering observert/);
});

test("no SEO report does not claim any site has passed", () => {
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report: null }));
  assert.match(html, /Ingen kontrollrapport tilgjengelig/);
});

test("known observed issue renders as an investigation, not an approval task", () => {
  const report = {
    checkedAt: "2026-10-15T08:00:00Z",
    sites: [{
      brandId: "zeneco", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 1, incomplete: false,
      visibilityDiagnostic: {
        brandId: "zeneco", sampledOnly: true, incomplete: false, publicationEligible: false,
        diagnosticStatus: "ACTION_REQUIRED",
        issues: [{ code: "HTTP_ERROR", evidence: "HTTP 404", affectedUrl: "https://www.zenecohomes.com/guide" }],
      },
    }],
  } as unknown as SEOControlReport;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report }));
  assert.match(html, /Dette bør undersøkes/);
  assert.match(html, /Gjenta kontrollen/);
  assert.match(html, /Skrivebeskyttet/);
  assert.doesNotMatch(html, /Godkjenn publisering/);
});

test("incomplete sampled audits cannot be presented as SEO-cleared sites", () => {
  const report = {
    sites: [{
      brandId: "zeneco", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 1, incomplete: true,
      visibilityDiagnostic: {
        diagnosticStatus: "UNKNOWN", issues: [], incomplete: true, sampledOnly: true, publicationEligible: false,
      },
    }],
  } as unknown as SEOControlReport;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report }));
  assert.match(html, /Ingen funn registrert, men datagrunnlaget er ufullstendig/);
  assert.doesNotMatch(html, /Ingen klassifiserte blokkeringer i utvalget/);
  assert.match(html, /1 observert side/);
});

test("publishing blocker is separate from technical SEO clearance and preserves evidence", () => {
  const report = {
    sites: [{
      brandId: "donaanna", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 4,
      sampledPaths: ["/om-oss", "/oliven"],
      incomplete: false,
      visibilityDiagnostic: { diagnosticStatus: "OBSERVED_NO_BLOCKERS", incomplete: false, sampledOnly: true, issues: [] },
    }, {
      brandId: "remasterfreddy", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 1,
      sampledPaths: [],
      incomplete: false,
      visibilityDiagnostic: {
        diagnosticStatus: "REVIEW_RECOMMENDED", incomplete: false, sampledOnly: true,
        issues: [{ code: "HEADING_STRUCTURE", evidence: "No server-rendered homepage H1" }],
      },
    }, {
      brandId: "zenecocare", checkedAt: "2026-10-15T08:00:00Z", pagesChecked: 4,
      sampledPaths: [], incomplete: false,
      visibilityDiagnostic: { diagnosticStatus: "OBSERVED_NO_BLOCKERS", incomplete: false, sampledOnly: true, issues: [] },
    }],
  } as unknown as SEOControlReport;
  const publishers = [
    { brandId: "donaanna", page: "/", status: "blocked", reason: "Metadata source differs from public page.", published: 0 },
    { brandId: "remasterfreddy", page: "/", status: "monitor", reason: "No search signal.", published: 0 },
  ] as any;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report, publishingStatuses: publishers }));
  assert.match(html, /Publiseringsblokkeringer/);
  assert.match(html, /Metadata source differs from public page/);
  assert.match(html, /No server-rendered homepage H1/);
  assert.match(html, /Care: kun teknisk kontroll/);
  assert.match(html, /Utvalgte sidebaner/);
  assert.match(html, /Sams metadata-publiseringskontroll/);
  assert.doesNotMatch(html, /Godkjenn publisering/);
});

test("no publisher data is not falsely treated as publication-ready or blocked", () => {
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report: null }));
  assert.doesNotMatch(html, /Publiseringsblokkeringer/);
});
