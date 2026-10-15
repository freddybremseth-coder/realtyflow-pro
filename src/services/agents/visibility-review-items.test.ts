import test from "node:test";
import assert from "node:assert/strict";
import { planVisibilityReviewItems } from "./visibility-review-items";
import type { SEOControlReport } from "./seo-control-report";

function report(sites: unknown[]): SEOControlReport {
  return { checkedAt: "2026-10-15T08:00:00Z", sites } as unknown as SEOControlReport;
}
function site(brandId: string, issues: unknown[], incomplete = false) {
  return {
    brandId, checkedAt: "2026-10-15T08:00:00Z", incomplete,
    pagesChecked: 1,
    visibilityDiagnostic: {
      brandId, issues, incomplete, sampledOnly: true,
      publicationEligible: false, diagnosticStatus: incomplete ? "UNKNOWN" : "ACTION_REQUIRED",
    },
  };
}
test("produces stable, read-only review suggestions without publishing authority", () => {
  const data = report([site("zeneco", [
    { code: "HTTP_ERROR", evidence: "HTTP 404", affectedUrl: "https://www.zenecohomes.com/guide" },
    { code: "HTTP_ERROR", evidence: "HTTP 404", affectedUrl: "https://www.zenecohomes.com/guide" },
  ])]);
  const items = planVisibilityReviewItems(data);
  assert.equal(items.length, 1);
  assert.equal(items[0].priority, "HIGH");
  assert.equal(items[0].requiresApproval, false);
  assert.equal(items[0].publicationEligible, false);
  assert.match(items[0].nextStep, /Gjenta kontrollen/);
  assert.deepEqual(items.map(item => item.key), planVisibilityReviewItems(data).map(item => item.key));
});
test("a missing or partial old report is an unknown data gap, not an SEO failure", () => {
  const items = planVisibilityReviewItems(report([{ brandId: "zeneco", checkedAt: "2026-10-15T08:00:00Z", incomplete: false }]));
  assert.equal(items.length, 1);
  assert.equal(items[0].type, "DATA_GAP");
  assert.equal(items[0].priority, "UNKNOWN");
  assert.equal(planVisibilityReviewItems(null).length, 0);
});
test("a complete audit with no findings generates no artificial tasks", () => {
  assert.equal(planVisibilityReviewItems(report([site("zeneco", [])])).length, 0);
});
test("an indexing signal for Care never recommends removing intentional noindex", () => {
  const item = planVisibilityReviewItems(report([site("zenecocare", [{ code: "INDEXING_BLOCKED", evidence: "Homepage noindex" }])]))[0];
  assert.equal(item.priority, "MEDIUM");
  assert.match(item.nextStep, /Ikke fjern tilsiktet noindex/);
});
test("brand and URL are included in dedup key to prevent cross-brand conflation", () => {
  const issues = [{ code: "HTTP_ERROR", evidence: "404", affectedUrl: "https://site.test/foo" }];
  const items = planVisibilityReviewItems(report([site("zeneco", issues), site("pinosoecolife", issues)]));
  assert.equal(items.length, 2);
  assert.notEqual(items[0].key, items[1].key);
});

test("schema parse errors are separate from headings and never imply misleading markup", () => {
  const item = planVisibilityReviewItems(report([site("zeneco", [{
    code: "SCHEMA_PARSE_ERROR", evidence: "2 invalid JSON-LD blocks",
    affectedUrl: "https://www.zenecohomes.com/",
  }])]))[0];
  assert.equal(item.priority, "MEDIUM");
  assert.equal(item.title, "Kontroller ugyldig JSON-LD");
  assert.match(item.nextStep, /ikke bevis på villedende schema/);
  assert.equal(item.publicationEligible, false);
});
