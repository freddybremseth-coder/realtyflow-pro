import assert from "node:assert/strict";
import test from "node:test";
import { sourcePredatesApprovedBuyerProfile } from "./buyer-profile-confirmation-freshness";

test("criteria confirmation treats messages older than the approved profile as stale", () => {
  assert.equal(
    sourcePredatesApprovedBuyerProfile("2026-09-22T18:00:00Z", "2026-09-28T18:57:00Z"),
    true,
  );
  assert.equal(
    sourcePredatesApprovedBuyerProfile("2026-09-29T08:00:00Z", "2026-09-28T18:57:00Z"),
    false,
  );
  assert.equal(sourcePredatesApprovedBuyerProfile(null, "2026-09-28T18:57:00Z"), false);
});
