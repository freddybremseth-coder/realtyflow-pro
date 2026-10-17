import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SEOControlReport } from "./seo-control-report";
import { planVisibilityQueue, syncVisibilityReviewQueue, VISIBILITY_REVIEW_BATCH_LIMIT } from "./visibility-queue-sync";

const checkedAt = "2026-10-17T07:00:00Z";
const now = new Date("2026-10-17T07:15:00Z");

function report(affectedUrl = "https://donaanna.com/"): SEOControlReport {
  return {
    checkedAt,
    referralsAvailable: false, leadsAvailable: false, collector: null,
    sites: [{
      brandId: "donaanna", checkedAt, incomplete: false, pagesChecked: 1,
      findings: 1, sampledPaths: [], accessibilityFindings: 0,
      invalidStructuredData: 0, pagesWithContactOrForm: 0,
      qualityPagesChecked: 1,
      visibilityDiagnostic: {
        incomplete: false,
        issues: [{ code: "HEADING_STRUCTURE", evidence: "Public HTML heading signal", affectedUrl }],
      },
    } as unknown as SEOControlReport["sites"][number]],
  };
}
test("one current owner-brand observation becomes one inert Sam review proposal", () => {
  const result = planVisibilityQueue(report(), now);
  assert.equal(result.available, true);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].assigned_agent, "sam");
  assert.equal(result.plans[0].metadata.publication_authorized, false);
  assert.equal(result.plans[0].metadata.execution_state, "PROPOSED");
});
test("stale report cannot create any task", () => {
  const result = planVisibilityQueue(report(), new Date("2026-11-01T00:00:00Z"));
  assert.equal(result.available, false);
  assert.equal(result.plans.length, 0);
});
test("foreign host and forged protocol are denied", () => {
  for (const url of ["https://otherbrand.example/", "http://donaanna.com/", "https://donaanna.com@evil.example/"]) {
    const result = planVisibilityQueue(report(url), now);
    assert.equal(result.plans.length, 0, url);
    assert.equal(result.rejected, 1);
  }
});
test("identical scans write the same deterministic identity; never mark work as executed", async () => {
  const received: Record<string, unknown>[] = [];
  const db = { rpc: async (_name: string, args: Record<string, unknown>) => {
    received.push(args);
    return { data: "58af5907-4b74-495a-8dd1-a555aa5719bd", error: null };
  }} as unknown as SupabaseClient;
  const first = await syncVisibilityReviewQueue(db, report(), now);
  const second = await syncVisibilityReviewQueue(db, report(), now);
  assert.equal(first.state, "registered");
  assert.equal(first.accepted, 1);
  assert.equal(second.accepted, 1);
  assert.deepEqual(received[0], received[1]);
  assert.equal(first.publicationAuthorized, false);
  assert.equal(first.executionStarted, false);
});
test("database error stops further registration and is reported, not hidden", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "service unavailable" } }) } as unknown as SupabaseClient;
  const result = await syncVisibilityReviewQueue(db, report(), now);
  assert.equal(result.state, "partial");
  assert.equal(result.accepted, 0);
  assert.equal(result.errors, 1);
});
test("batch limit is small and enforced", () => {
  assert.equal(VISIBILITY_REVIEW_BATCH_LIMIT, 30);
});
