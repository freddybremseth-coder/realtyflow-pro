import assert from "node:assert/strict";
import test from "node:test";
import {
  CORRELATION_ID_HEADER,
  createErrorEnvelope,
  generateCorrelationId,
  getOrCreateCorrelationId,
  isCorrelationId,
  redactSecrets,
  sanitizeErrorMessage,
} from "./observability";

test("generates and validates RealtyFlow correlation IDs", () => {
  const id = generateCorrelationId(1_765_000_000_000);

  assert.equal(isCorrelationId(id), true);
  assert.match(id, /^rf_/);
});

test("uses valid incoming correlation IDs and rejects invalid ones", () => {
  const valid = "rf_mi7v4zk0_0123456789abcdef01234567";

  assert.equal(getOrCreateCorrelationId({ [CORRELATION_ID_HEADER]: valid }), valid);
  assert.equal(isCorrelationId(getOrCreateCorrelationId({ [CORRELATION_ID_HEADER]: "bad id" })), true);
});

test("redacts sensitive keys and token-like values", () => {
  const redacted = redactSecrets({
    access_token: "plain-token",
    nested: {
      Authorization: "Bearer abc.def.ghi",
      safe: "keep me",
      database: "postgres://user:password@example.supabase.co/postgres",
    },
  }) as Record<string, any>;

  assert.equal(redacted.access_token, "[REDACTED]");
  assert.equal(redacted.nested.Authorization, "[REDACTED]");
  assert.equal(redacted.nested.safe, "keep me");
  assert.equal(redacted.nested.database, "[REDACTED]example.supabase.co/postgres");
});

test("sanitizes error messages without leaking secrets", () => {
  const message = sanitizeErrorMessage("Upload failed with Bearer super-secret-token");

  assert.equal(message, "Upload failed with [REDACTED]");
});

test("creates safe machine-readable error envelopes", () => {
  const envelope = createErrorEnvelope({
    correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
    code: "YT_UPLOAD_TIMEOUT",
    message: "YouTube upload timed out",
    retryable: "retryable",
    status: 504,
    details: {
      refresh_token: "hidden",
      step: "youtube_upload",
    },
  });

  assert.deepEqual(envelope, {
    ok: false,
    error: {
      correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
      code: "YT_UPLOAD_TIMEOUT",
      message: "YouTube upload timed out",
      retryable: "retryable",
      status: 504,
      details: {
        refresh_token: "[REDACTED]",
        step: "youtube_upload",
      },
    },
  });
});
