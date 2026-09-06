import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeMarketingAutopilotHeartbeat } from "./autopilot-heartbeat";

describe("Marketing Autopilot heartbeat", () => {
  it("summarizes healthy and skipped execution without content", () => {
    const result = summarizeMarketingAutopilotHeartbeat([
      { brandId: "zeneco", channel: "facebook", publications: [{ publicationId: "p1", error: null }] },
      { brandId: "donaanna", channel: "instagram", skipped: true, reason: "time slot" },
    ]);
    assert.equal(result.status, "success");
    assert.equal(result.publicationResults, 1);
    assert.equal(result.skipped, 1);
    assert.deepEqual(result.brands, ["donaanna", "zeneco"]);
  });

  it("marks partial when a brand or publication reports an error", () => {
    const result = summarizeMarketingAutopilotHeartbeat([
      { brandId: "remasterfreddy", channel: "facebook", error: "generation failed" },
      { brandId: "zeneco", channel: "facebook", publications: [{ error: "publish failed" }] },
    ]);
    assert.equal(result.status, "partial");
    assert.equal(result.errored, 1);
    assert.equal(result.publicationErrors, 1);
  });
});
