import assert from "node:assert/strict";
import test from "node:test";
import {
  marketingRunResultsAreSuccessful,
  successfulMarketingRunIds,
} from "@/services/marketing/run-lifecycle";

test("marketing lifecycle only closes runs where every publication succeeded", () => {
  assert.equal(marketingRunResultsAreSuccessful([{ state: "published" }]), true);
  assert.equal(marketingRunResultsAreSuccessful([{ state: "published" }, { state: "scheduled" }]), true);
  assert.equal(marketingRunResultsAreSuccessful([{ state: "published" }, { state: "draft" }]), false);
  assert.equal(marketingRunResultsAreSuccessful([{ state: "paused" }]), false);
  assert.equal(marketingRunResultsAreSuccessful([{ state: "failed" }]), false);
  assert.equal(marketingRunResultsAreSuccessful([]), false);
});

test("successfulMarketingRunIds excludes mixed, paused and failed runs", () => {
  const ids = successfulMarketingRunIds([
    { marketing_run_id: "mrun_done_1", state: "published" },
    { marketing_run_id: "mrun_done_2", state: "published" },
    { marketing_run_id: "mrun_done_2", state: "scheduled" },
    { marketing_run_id: "mrun_mixed", state: "published" },
    { marketing_run_id: "mrun_mixed", state: "draft" },
    { marketing_run_id: "mrun_paused", state: "paused" },
    { marketing_run_id: "mrun_failed", state: "failed" },
    { marketing_run_id: null, state: "published" },
  ]);

  assert.deepEqual(ids, ["mrun_done_1", "mrun_done_2"]);
});
