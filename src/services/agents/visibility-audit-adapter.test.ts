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
  assert.equal(result.diagnosticStatus, "OBSERVED_NO_BLOCKERS");
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

test("non-200 homepage is a diagnostic issue, never publishing authority", () => {
  const sample = audit();
  sample.home.status = 301;
  const result = visibilityAuditSummary(sample);
  assert.equal(result.diagnosticStatus, "ACTION_REQUIRED");
  assert.equal(result.publicationEligible, false);
});

test("JSON-LD parse errors do not masquerade as heading defects or misleading schema", () => {
  const sample = audit();
  sample.home.jsonLdParseErrors = 2;
  const result = visibilityAuditSummary(sample);
  assert.ok(result.issues.some(issue => issue.code === "SCHEMA_PARSE_ERROR"));
  assert.ok(!result.issues.some(issue => issue.code === "HEADING_STRUCTURE"));
  assert.ok(!result.issues.some(issue => issue.code === "MISLEADING_SCHEMA"));
  assert.equal(result.diagnosticStatus, "REVIEW_RECOMMENDED");
  assert.equal(result.publicationEligible, false);
});
