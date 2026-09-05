import { describe, expect, it } from "vitest";
import { summarizeMarketingAutopilotHeartbeat } from "./autopilot-heartbeat";

describe("Marketing Autopilot heartbeat", () => {
  it("summarizes healthy and skipped execution without content", () => {
    const result = summarizeMarketingAutopilotHeartbeat([
      { brandId: "zeneco", channel: "facebook", publications: [{ publicationId: "p1", error: null }] },
      { brandId: "donaanna", channel: "instagram", skipped: true, reason: "time slot" },
    ]);
    expect(result.status).toBe("success");
    expect(result.publicationResults).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.brands).toEqual(["donaanna", "zeneco"]);
  });

  it("marks partial when a brand or publication reports an error", () => {
    const result = summarizeMarketingAutopilotHeartbeat([
      { brandId: "remasterfreddy", channel: "facebook", error: "generation failed" },
      { brandId: "zeneco", channel: "facebook", publications: [{ error: "publish failed" }] },
    ]);
    expect(result.status).toBe("partial");
    expect(result.errored).toBe(1);
    expect(result.publicationErrors).toBe(1);
  });
});
