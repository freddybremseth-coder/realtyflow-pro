import { describe, expect, it } from "vitest";
import { assessRemasterHealth } from "./remaster-health-monitor";

const NOW = Date.parse("2026-09-05T18:00:00.000Z");

function healthy() {
  return {
    planActive: true,
    controlledAuto: true,
    planUpdatedAt: "2026-09-05T16:00:00.000Z",
    facebookConfigured: true,
    youtubeConnected: true,
    sourceSyncLastSuccessAt: "2026-09-05T17:40:00.000Z",
    sourceSyncFreshnessMinutes: 90,
    growthLoopLastRunAt: "2026-09-05T17:35:00.000Z",
    growthLoopFreshnessMinutes: 26 * 60,
    marketingAutopilotLastRunAt: null,
    marketingAutopilotLastStatus: null,
    marketingAutopilotFreshnessMinutes: 150,
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

  it("does not alarm before the first Marketing Autopilot heartbeat exists", () => {
    expect(assessRemasterHealth(healthy(), NOW).state).toBe("healthy");
  });

  it("warns when the last Marketing Autopilot heartbeat is partial", () => {
    const result = assessRemasterHealth({ ...healthy(), marketingAutopilotLastRunAt: "2026-09-05T17:00:00.000Z", marketingAutopilotLastStatus: "partial" }, NOW);
    expect(result.state).toBe("partial");
  });

  it("fails when the last Marketing Autopilot heartbeat is error", () => {
    const result = assessRemasterHealth({ ...healthy(), marketingAutopilotLastRunAt: "2026-09-05T17:00:00.000Z", marketingAutopilotLastStatus: "error" }, NOW);
    expect(result.state).toBe("error");
  });

  it("warns when an established Marketing Autopilot heartbeat becomes stale", () => {
    const result = assessRemasterHealth({ ...healthy(), marketingAutopilotLastRunAt: "2026-09-05T14:00:00.000Z", marketingAutopilotLastStatus: "success" }, NOW);
    expect(result.state).toBe("partial");
    expect(result.reasons.join(" ")).toContain("stale");
  });

  it("warns on source drift without treating it as a hard outage", () => {
    const result = assessRemasterHealth({ ...healthy(), sourceDriftCount: 1 }, NOW);
    expect(result.state).toBe("partial");
  });

  it("fails closed when YouTube is disconnected", () => {
    expect(assessRemasterHealth({ ...healthy(), youtubeConnected: false }, NOW).state).toBe("error");
  });

  it("warns after repeated negative measured actions", () => {
    expect(assessRemasterHealth({ ...healthy(), consecutiveNegativeMeasuredActions: 2 }, NOW).state).toBe("partial");
  });

  it("detects a stale source sync", () => {
    expect(assessRemasterHealth({ ...healthy(), sourceSyncLastSuccessAt: "2026-09-05T15:00:00.000Z" }, NOW).state).toBe("partial");
  });

  it("does not flag a missing growth heartbeat immediately after activation", () => {
    expect(assessRemasterHealth({ ...healthy(), growthLoopLastRunAt: null, planUpdatedAt: "2026-09-05T16:00:00.000Z" }, NOW).state).toBe("healthy");
  });

  it("flags a missing growth heartbeat after a mature activation window", () => {
    expect(assessRemasterHealth({ ...healthy(), growthLoopLastRunAt: null, planUpdatedAt: "2026-09-03T12:00:00.000Z" }, NOW).state).toBe("partial");
  });
});
