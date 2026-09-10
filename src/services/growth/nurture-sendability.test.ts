import assert from "node:assert/strict";
import { evaluateNurtureSendability } from "./nurture-sendability";

assert.equal(evaluateNurtureSendability({ email: "buyer@example.com" }).sendable, true);
assert.equal(evaluateNurtureSendability({ email: " BUYER@EXAMPLE.COM " }).normalizedEmail, "buyer@example.com");

assert.equal(evaluateNurtureSendability({ email: "a@example.com;b@example.com" }).reason, "MULTIPLE_EMAILS");
assert.equal(evaluateNurtureSendability({ email: "not-an-email" }).reason, "INVALID_EMAIL");
assert.equal(evaluateNurtureSendability({ email: "buyer@example.com", normalizedEmailCount: 2 }).reason, "DUPLICATE_EMAIL");

assert.equal(evaluateNurtureSendability({ email: "buyer@example.com", doNotContact: true }).reason, "DO_NOT_CONTACT");
assert.equal(evaluateNurtureSendability({ email: "buyer@example.com", emailSuppressed: true }).reason, "EMAIL_SUPPRESSED");
assert.equal(evaluateNurtureSendability({ email: "buyer@example.com", pipelineStatus: "LOST" }).reason, "TERMINAL_PIPELINE");
assert.equal(evaluateNurtureSendability({ email: "buyer@example.com", pipelineStatus: "WON" }).reason, "TERMINAL_PIPELINE");

const unresolved = evaluateNurtureSendability({
  email: "buyer@example.com",
  lastRealSendAt: "2026-09-01T10:00:00Z",
  lastInboundReplyAt: "2026-09-02T10:00:00Z",
});
assert.equal(unresolved.sendable, false);
assert.equal(unresolved.reason, "UNRESOLVED_INBOUND_REPLY");
assert.equal(unresolved.requiresReview, true);

const repliedBeforeLatestSend = evaluateNurtureSendability({
  email: "buyer@example.com",
  lastInboundReplyAt: "2026-09-01T10:00:00Z",
  lastRealSendAt: "2026-09-02T10:00:00Z",
});
assert.equal(repliedBeforeLatestSend.sendable, true);

console.log("nurture sendability tests passed");
