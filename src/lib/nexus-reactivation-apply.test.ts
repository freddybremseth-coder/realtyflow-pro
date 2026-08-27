import assert from "node:assert/strict";
import test from "node:test";
import { buildReactivationApplyDecision } from "./nexus-reactivation-apply";

const replyAt = "2026-08-27T10:30:00.000Z";

function classification(intent: "reactivate_now" | "update_preferences" | "follow_up_later" | "stop" | "unclear") {
  return {
    intent,
    confidence: 0.95,
    reasons: [],
    suggestedPipelineAction: intent === "stop"
      ? "suppress_nurture"
      : intent === "update_preferences"
        ? "refresh_buyer_profile"
        : intent === "follow_up_later"
          ? "schedule_future_followup"
          : intent === "reactivate_now"
            ? "move_to_contact"
            : "manual_review",
    shouldReactivatePipeline: intent === "reactivate_now" || intent === "update_preferences",
    requiresHumanReview: intent === "unclear",
  } as const;
}

test("NEW positive reply moves to CONTACT and stops nurture", () => {
  const result = buildReactivationApplyDecision({ classification: classification("reactivate_now"), currentPipelineStatus: "NEW", replyOccurredAt: replyAt });
  assert.equal(result.allowed, true);
  assert.equal(result.contactUpdates.pipeline_status, "CONTACT");
  assert.equal(result.contactUpdates.nurture_status, "completed");
});

test("QUALIFIED positive reply preserves earned qualification", () => {
  const result = buildReactivationApplyDecision({ classification: classification("reactivate_now"), currentPipelineStatus: "QUALIFIED", replyOccurredAt: replyAt });
  assert.equal(result.contactUpdates.pipeline_status, "QUALIFIED");
});

test("changed preferences create a refresh work item without degrading stage", () => {
  const result = buildReactivationApplyDecision({ classification: classification("update_preferences"), currentPipelineStatus: "QUALIFIED", replyOccurredAt: replyAt });
  assert.equal(result.allowed, true);
  assert.equal(result.contactUpdates.pipeline_status, "QUALIFIED");
  assert.equal(result.createBuyerProfileRefreshWorkItem, true);
});

test("explicit stop only pauses nurture and preserves pipeline stage", () => {
  const result = buildReactivationApplyDecision({ classification: classification("stop"), currentPipelineStatus: "QUALIFIED", replyOccurredAt: replyAt });
  assert.equal(result.allowed, true);
  assert.equal(result.contactUpdates.nurture_status, "paused");
  assert.equal(Object.prototype.hasOwnProperty.call(result.contactUpdates, "pipeline_status"), false);
});

test("later and unclear replies are not writable in v1", () => {
  assert.equal(buildReactivationApplyDecision({ classification: classification("follow_up_later"), currentPipelineStatus: "CONTACT", replyOccurredAt: replyAt }).allowed, false);
  assert.equal(buildReactivationApplyDecision({ classification: classification("unclear"), currentPipelineStatus: "CONTACT", replyOccurredAt: replyAt }).allowed, false);
});
