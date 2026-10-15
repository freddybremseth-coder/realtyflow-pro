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
