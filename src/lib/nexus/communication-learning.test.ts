import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNICATION_LEARNING_SAFETY,
  deriveCommunicationLearningDimensions,
  evaluateCommunicationRule,
  messageLengthBucket,
  sendHourBucket,
  sendWeekday,
} from "./communication-learning";

test("derives bounded timing and style dimensions from sent messages", () => {
  const dims = Object.fromEntries(deriveCommunicationLearningDimensions({
    sentAt: "2026-09-12T18:30:00.000Z",
    bodyText: "x".repeat(400),
    tone: "professional",
    language: "no",
    intent: "property_interest",
  }));
  assert.equal(dims.tone, "professional");
  assert.equal(dims.language, "no");
  assert.equal(dims.intent, "property_interest");
  assert.equal(dims.send_hour_utc, "18-21");
  assert.equal(dims.weekday_utc, "sat");
  assert.equal(dims.message_length, "medium");
});

test("uses deterministic length, hour and weekday buckets", () => {
  assert.equal(messageLengthBucket("x".repeat(100)), "short");
  assert.equal(messageLengthBucket("x".repeat(500)), "medium");
  assert.equal(messageLengthBucket("x".repeat(1200)), "long");
  assert.equal(sendHourBucket("2026-09-12T07:00:00.000Z"), "06-09");
  assert.equal(sendHourBucket("2026-09-12T22:10:00.000Z"), "22-23");
  assert.equal(sendWeekday("2026-09-12T12:00:00.000Z"), "sat");
});

test("requires evidence before producing prefer or avoid rules", () => {
  const insufficient = evaluateCommunicationRule({ sent: 7, replies: 7, editSum: 0, baselineSent: 100, baselineReplies: 20 });
  assert.equal(insufficient.evidence, "limited");
  assert.equal(insufficient.verdict, "observe");

  const preferred = evaluateCommunicationRule({ sent: 20, replies: 10, editSum: 2, baselineSent: 100, baselineReplies: 20 });
  assert.equal(preferred.evidence, "moderate");
  assert.equal(preferred.verdict, "prefer");

  const avoided = evaluateCommunicationRule({ sent: 20, replies: 1, editSum: 9, baselineSent: 100, baselineReplies: 25 });
  assert.equal(avoided.verdict, "avoid");
});

test("learning remains advisory and cannot broaden autonomy", () => {
  assert.deepEqual(COMMUNICATION_LEARNING_SAFETY, {
    observationalOnly: true,
    automaticSendAllowed: false,
    policyMutationAllowed: false,
    autonomyExpansionAllowed: false,
    maxTimingAuthority: "recommendation_only",
  });
});
