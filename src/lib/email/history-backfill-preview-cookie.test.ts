import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEmailHistoryBackfillPreviewCookieValue,
  readEmailHistoryBackfillPreviewCookieValue,
} from "./history-backfill-preview-cookie";

const fingerprint = "a".repeat(64);

test("backfill preview cookie round-trips brand and fingerprint", () => {
  const value = buildEmailHistoryBackfillPreviewCookieValue("soleada", fingerprint);
  assert.equal(readEmailHistoryBackfillPreviewCookieValue(value, "soleada"), fingerprint);
});

test("backfill preview cookie is brand-bound", () => {
  const value = buildEmailHistoryBackfillPreviewCookieValue("soleada", fingerprint);
  assert.equal(readEmailHistoryBackfillPreviewCookieValue(value, "zeneco"), null);
});

test("backfill preview cookie rejects malformed fingerprints", () => {
  const value = buildEmailHistoryBackfillPreviewCookieValue("soleada", "not-a-fingerprint");
  assert.equal(readEmailHistoryBackfillPreviewCookieValue(value, "soleada"), null);
});
