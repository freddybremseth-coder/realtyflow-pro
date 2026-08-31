import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_HISTORY_BACKFILL_CONFIRMATION,
  EMAIL_HISTORY_BACKFILL_MAX_DAYS,
  EMAIL_HISTORY_BACKFILL_MAX_MESSAGES,
  resolveEmailHistoryBackfillRequest,
} from "./history-backfill-policy";

test("email history backfill defaults to bounded preview with sent included", () => {
  const result = resolveEmailHistoryBackfillRequest({ brand_id: "soleada" });
  assert.equal(result.ok, true);
  assert.deepEqual(result.request, {
    brandId: "soleada",
    sinceDays: 365,
    maxMessages: 250,
    includeSent: true,
    mode: "preview",
  });
});

test("email history backfill clamps requested history and message volume", () => {
  const result = resolveEmailHistoryBackfillRequest({
    brand_id: "soleada",
    since_days: 5000,
    max_messages: 9999,
    include_sent: false,
  });
  assert.equal(result.request?.sinceDays, EMAIL_HISTORY_BACKFILL_MAX_DAYS);
  assert.equal(result.request?.maxMessages, EMAIL_HISTORY_BACKFILL_MAX_MESSAGES);
  assert.equal(result.request?.includeSent, false);
});

test("email history backfill apply requires explicit confirmation", () => {
  const rejected = resolveEmailHistoryBackfillRequest({ brand_id: "soleada", mode: "apply" });
  assert.equal(rejected.ok, false);

  const accepted = resolveEmailHistoryBackfillRequest({
    brand_id: "soleada",
    mode: "apply",
    confirm: EMAIL_HISTORY_BACKFILL_CONFIRMATION,
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.request?.mode, "apply");
});

test("email history backfill requires an explicit brand", () => {
  const result = resolveEmailHistoryBackfillRequest({});
  assert.equal(result.ok, false);
  assert.equal(result.error, "brand_id is required");
});
