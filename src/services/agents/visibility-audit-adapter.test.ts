import test from "node:test";
import assert from "node:assert/strict";
import { visibilityAuditSummary } from "./visibility-audit-adapter";
import type { SiteAudit } from "./seo-audit";

function audit(overrides: Partial<SiteAudit> = {}): SiteAudit {
  return {
    brandId: "zeneco", base: "https://www.zenecohomes.com",
    checkedAt: "2026-10-15T00:00:00Z",
    home: { status: 200, finalUrl: "https://www.zenecohomes.com/", title: "Test", description: "ok", canonical: "https://www.zenecohomes.com/", h1Count: 1, xRobots: null, robotsMeta: null, jsonLdCount: 0, jsonLdParseErrors: 0 },
    robots: { status: 200, sitemapDeclared: true, googlebotBlocked: false },
    sitemap: { status: 200, urlCountSample: 1, xmlLike: true },
    observations: [], samples: [], limitations: [], ...overrides,
  };
}
test("bounded healthy audit cannot authorize publication", () => {
  const result = visibilityAuditSummary(audit());
  assert.equal(result.publicationEligible, false);
  assert.equal(result.diagnosticStatus, "APPROVED");
});
test("unknown homepage is not silently treated as passing", () => {
  const sample = audit();
  sample.home.status = null;
  assert.equal(visibilityAuditSummary(sample).diagnosticStatus, "UNKNOWN");
});
test("explicit noindex is flagged without inferring desired indexing", () => {
  const sample = audit();
  sample.home.robotsMeta = "noindex,follow";
  const result = visibilityAuditSummary(sample);
  assert.ok(result.issues.some(issue => issue.code === "INDEXING_BLOCKED"));
  assert.equal(result.publicationEligible, false);
});
