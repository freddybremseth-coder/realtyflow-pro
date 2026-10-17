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

test("old sample cannot be described as current SEO clearance", () => {
  const report = {
    sites: [{
      brandId: "donaanna", pagesChecked: 1, checkedAt: "2024-01-01T00:00:00Z",
      incomplete: false, sampledPaths: [],
      visibilityDiagnostic: { diagnosticStatus: "OBSERVED_NO_BLOCKERS", issues: [], incomplete: false, sampledOnly: true },
    }],
  } as unknown as SEOControlReport;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report }));
  assert.match(html, /eldre kontroll/);
  assert.match(html, /Kontrollen er eldre enn 10 dager/);
  assert.match(html, /historiske observasjoner/);
});

test("missing evidence timestamp is unknown rather than a fresh approval", () => {
  const report = {
    sites: [{
      brandId: "remasterfreddy", pagesChecked: 1, checkedAt: "invalid-timestamp",
      incomplete: false, sampledPaths: [],
      visibilityDiagnostic: { diagnosticStatus: "REVIEW_RECOMMENDED", issues: [
        { code: "HEADING_STRUCTURE", evidence: "Server HTML lacks H1" },
      ], incomplete: false, sampledOnly: true },
    }],
  } as unknown as SEOControlReport;
  const html = renderToStaticMarkup(createElement(VisibilityOverview, { report }));
  assert.match(html, /kontrolltid ukjent/);
  assert.match(html, /Kontrolltidspunktet kan ikke verifiseres/);
  assert.match(html, /Server HTML lacks H1/);
  assert.doesNotMatch(html, /Invalid Date/);
});

test("stored publisher blockers disclose unavailable verification time", () => {
  const html = renderToStaticMarkup(createElement(VisibilityOverview, {
    report: null, publishingStatuses: [
      { brandId: "donaanna", status: "blocked", reason: "Source mismatch", page: "/", published: 0 },
    ],
  }));
  assert.match(html, /kontrolltid ukjent/);
  assert.match(html, /kontrolltid er ikke oppgitt/);
  assert.match(html, /Source mismatch/);
  assert.doesNotMatch(html, /Godkjenn publisering/);
});
