import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_DRAFT_MAX_ATTEMPTS,
  nextEmailDraftRetry,
  sanitizeEmailDraftError,
} from "@/services/email/auto-draft-retry";

const now = new Date("2026-09-16T20:00:00.000Z");

test("email auto-draft retry policy backs off and quarantines on fifth failure", () => {
  assert.equal(nextEmailDraftRetry(1, now).retryAfter, "2026-09-16T20:10:00.000Z");
  assert.equal(nextEmailDraftRetry(2, now).retryAfter, "2026-09-16T20:30:00.000Z");
  assert.equal(nextEmailDraftRetry(3, now).retryAfter, "2026-09-16T22:00:00.000Z");
  assert.equal(nextEmailDraftRetry(4, now).retryAfter, "2026-09-17T02:00:00.000Z");

  const fifth = nextEmailDraftRetry(EMAIL_DRAFT_MAX_ATTEMPTS, now);
  assert.equal(fifth.quarantined, true);
  assert.equal(fifth.retryAfter, null);
  assert.equal(fifth.quarantinedAt, now.toISOString());
});

test("email draft errors are compacted before persistence", () => {
  const error = new Error(`provider failed\n${"x".repeat(900)}`);
  const sanitized = sanitizeEmailDraftError(error);
  assert.equal(sanitized.includes("\n"), false);
  assert.equal(sanitized.length, 500);
  assert.match(sanitized, /^provider failed /);
});
