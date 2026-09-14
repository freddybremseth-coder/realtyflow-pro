import assert from "node:assert/strict";
import test from "node:test";
import { combineBuyerJourneyHealth, evaluateBuyerProfileHealth, evaluateMatchQuality } from "./buyer-profile-health";

test("blocks a profile with missing commercial anchors and conflicting evidence", () => {
  const result = evaluateBuyerProfileHealth(
    { status: "approved", budgetAmount: null, purchaseReadiness: "unknown", updatedAt: "2026-09-01" },
    [
      { key: "location", value: "Moraira", confidence: 0.9, customerConfirmed: true, approvalStatus: "approved" },
      { key: "location", value: "Altea", confidence: 0.8, customerConfirmed: false, approvalStatus: "approved" },
    ],
    new Date("2026-09-14T00:00:00Z"),
  );
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.missing.includes("budsjett"));
  assert.deepEqual(result.conflicts, ["location"]);
  assert.ok(result.score <= 49);
});

test("marks a complete fresh confirmed profile healthy", () => {
  const criteria = ["location", "property_type", "bedrooms"].map((key) => ({
    key, value: key, confidence: 1, customerConfirmed: true, approvalStatus: "approved",
  }));
  const result = evaluateBuyerProfileHealth(
    { status: "approved", budgetAmount: 600000, purchaseReadiness: "hot", updatedAt: "2026-09-10" },
    criteria,
    new Date("2026-09-14T00:00:00Z"),
  );
  assert.equal(result.status, "HEALTHY");
  assert.equal(result.completeness, 100);
  assert.equal(result.evidenceQuality, 100);
});

test("match health fails closed for weak or undocumented shortlists", () => {
  assert.equal(evaluateMatchQuality([]).status, "BLOCKED");
  const weak = evaluateMatchQuality([{ score: 55, dataQualityScore: 40, systemEligibility: "eligible", reviewStatus: "needs_review" }]);
  assert.equal(weak.status, "BLOCKED");
  assert.ok(weak.blockers.length >= 2);
});

test("healthy journey requires both profile and match health", () => {
  const profile = evaluateBuyerProfileHealth(
    { status: "approved", budgetAmount: 500000, purchaseReadiness: "ready_to_buy", updatedAt: "2026-09-12" },
    ["location", "property_type", "bedrooms"].map((key) => ({ key, value: "x", confidence: 1, customerConfirmed: true, approvalStatus: "approved" })),
    new Date("2026-09-14T00:00:00Z"),
  );
  const match = evaluateMatchQuality([
    { score: 90, dataQualityScore: 90, systemEligibility: "eligible", reviewStatus: "client_ready" },
    { score: 82, dataQualityScore: 80, systemEligibility: "eligible", reviewStatus: "client_ready" },
  ]);
  assert.equal(match.status, "HEALTHY");
  assert.equal(combineBuyerJourneyHealth(profile, match), "HEALTHY");
});
