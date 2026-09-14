import assert from "node:assert/strict";
import test from "node:test";
import { classifyFreddyReview, describeFreddyReview, sortFreddyReviews } from "./review-console";

test("classifies only work that needs a human decision and uses the latest-stage precedence", () => {
  assert.equal(classifyFreddyReview({ presentation_review_required: true, shortlist_review_required: true }), "final_send");
  assert.equal(classifyFreddyReview({ shortlist_review_required: "true" }), "shortlist");
  assert.equal(classifyFreddyReview({ no_match_review_required: true }), "no_match");
  assert.equal(classifyFreddyReview({ kind: "buyer_profile_email_review", requires_human_interpretation: true }), "buyer_criteria");
  assert.equal(classifyFreddyReview({ kind: "buyer_intake_review" }), "buyer_intake");
  assert.equal(classifyFreddyReview({ property_match_status: "COMPLETED" }), null);
  assert.equal(describeFreddyReview({ id: "wrong-source", sourceType: "crm", metadata: { kind: "buyer_intake_review" } }), null);
});

test("final send review exposes approval but explains that approval only opens preflight", () => {
  const item = describeFreddyReview({
    id: "work-1",
    priority: "high",
    metadata: {
      presentation_review_required: true,
      shortlist_human_review_complete: true,
      presentation_id: "presentation-1",
      presentation_message_draft_id: "draft-1",
    },
  });
  assert.equal(item?.kind, "final_send");
  assert.deepEqual(item?.actions, ["approve_send", "reject", "edit"]);
  assert.match(item?.recommendation || "", /preflight/i);
  assert.deepEqual(item?.uncertainty, []);
});

test("sorts high priority first and oldest first inside a priority", () => {
  const result = sortFreddyReviews([
    { priority: "MEDIUM" as const, updatedAt: "2026-09-03" },
    { priority: "HIGH" as const, updatedAt: "2026-09-02" },
    { priority: "HIGH" as const, updatedAt: "2026-09-01" },
  ]);
  assert.deepEqual(result.map((item) => item.updatedAt), ["2026-09-01", "2026-09-02", "2026-09-03"]);
});
