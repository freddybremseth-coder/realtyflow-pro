import assert from "node:assert/strict";
import test from "node:test";
import { evaluateEmailHistoryBackfillAccountGate } from "./history-backfill-account-gate";

test("backfill account gate allows apply when every account fetch succeeded", () => {
  const result = evaluateEmailHistoryBackfillAccountGate([
    { email: "a@example.com" },
    { email: "b@example.com" },
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failedAccounts, []);
});

test("backfill account gate blocks apply when any account fetch failed", () => {
  const result = evaluateEmailHistoryBackfillAccountGate([
    { email: "a@example.com" },
    { email: "b@example.com", error: "IMAP timeout" },
  ]);
  assert.equal(result.ok, false);
  assert.deepEqual(result.failedAccounts, [
    { email: "b@example.com", error: "IMAP timeout" },
  ]);
});
