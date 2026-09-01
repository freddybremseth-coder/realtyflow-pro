import assert from "node:assert/strict";
import test from "node:test";
import { buildEmailHistoryBackfillPreviewFingerprint } from "./history-backfill-preview-fingerprint";

const base = {
  brandId: "soleada",
  sinceDays: 180,
  maxMessages: 200,
  includeSent: true,
  candidateMessageIds: ["<b@example.com>", "<a@example.com>"],
};

test("fingerprint is stable regardless of candidate order", () => {
  const first = buildEmailHistoryBackfillPreviewFingerprint(base);
  const second = buildEmailHistoryBackfillPreviewFingerprint({ ...base, candidateMessageIds: [...base.candidateMessageIds].reverse() });
  assert.equal(first, second);
});

test("fingerprint changes when preview candidate set changes", () => {
  const first = buildEmailHistoryBackfillPreviewFingerprint(base);
  const second = buildEmailHistoryBackfillPreviewFingerprint({ ...base, candidateMessageIds: [...base.candidateMessageIds, "<c@example.com>"] });
  assert.notEqual(first, second);
});

test("fingerprint binds brand and preview parameters", () => {
  const first = buildEmailHistoryBackfillPreviewFingerprint(base);
  assert.notEqual(first, buildEmailHistoryBackfillPreviewFingerprint({ ...base, brandId: "zeneco" }));
  assert.notEqual(first, buildEmailHistoryBackfillPreviewFingerprint({ ...base, sinceDays: 181 }));
  assert.notEqual(first, buildEmailHistoryBackfillPreviewFingerprint({ ...base, maxMessages: 201 }));
  assert.notEqual(first, buildEmailHistoryBackfillPreviewFingerprint({ ...base, includeSent: false }));
});
