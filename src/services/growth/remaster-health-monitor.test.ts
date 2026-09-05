import { describe, expect, it } from "vitest";
import { assessRemasterHealth } from "./remaster-health-monitor";

const NOW = Date.parse("2026-09-05T18:00:00.000Z");

function healthy() {
  return {
    planActive: true,
    controlledAuto: true,
    facebookConfigured: true,
    youtubeConnected: true,
    sourceSyncLastSuccessAt: "2026-09-05T17:40:00.000Z",
    sourceSyncFreshnessMinutes: 90,
    sourceDriftCount: 0,
    pendingPromotionRequestAgeMinutes: 15,
    failedPromotionRequests24h: 0,
    failedGrowthActions24h: 0,
    consecutiveNegativeMeasuredActions: 0,
  };
}

describe("assessRemasterHealth", () => {
  it("stays quiet when the autonomous chain is healthy", () => {
    const result = assessRemasterHealth(healthy(), NOW);
    expect(result.state).toBe("healthy");
    expect(result.reasons).toEqual([]);
  });

  it("warns on source drift without treating it as a hard outage", () => {
    const result = assessRemasterHealth({ ...healthy(), sourceDriftCount: 1 }, NOW);
    expect(result.state).toBe("partial");
    expect(result.reasons.join(" ")).toContain("out of sync");
  });

  it("fails closed when YouTube is disconnected", () => {
    const result = assessRemasterHealth({ ...healthy(), youtubeConnected: false }, NOW);
    expect(result.state).toBe("error");
    expect(result.reasons.join(" ")).toContain("YouTube");
  });

  it("warns after repeated negative measured actions", () => {
    const result = assessRemasterHealth({ ...healthy(), consecutiveNegativeMeasuredActions: 2 }, NOW);
    expect(result.state).toBe("partial");
  });

  it("detects a stale source sync", () => {
    const result = assessRemasterHealth({ ...healthy(), sourceSyncLastSuccessAt: "2026-09-05T15:00:00.000Z" }, NOW);
    expect(result.state).toBe("partial");
    expect(result.reasons.join(" ")).toContain("no fresh successful run");
  });
});
