import { describe, expect, it } from "vitest";
import { cadenceBandTargetHours, observePublicationCadence } from "@/lib/marketing/cadence-learning";

describe("marketing cadence learning", () => {
  const current = "2026-09-06T12:00:00.000Z";

  it("quarantines historical runaway cadence below six hours", () => {
    const result = observePublicationCadence(current, "2026-09-06T11:55:00.000Z");
    expect(result.publishGapBand).toBe("under_6h");
    expect(result.learningEligible).toBe(false);
    expect(result.reason).toBe("historical_runaway_cadence");
  });

  it("classifies safe observed cadence bands", () => {
    expect(observePublicationCadence(current, "2026-09-05T12:00:00.000Z").publishGapBand).toBe("h_20_36");
    expect(observePublicationCadence(current, "2026-09-04T12:00:00.000Z").publishGapBand).toBe("h_36_72");
    expect(observePublicationCadence(current, "2026-09-02T12:00:00.000Z").publishGapBand).toBe("h_72_120");
  });

  it("does not invent cadence evidence for a first post", () => {
    const result = observePublicationCadence(current, null);
    expect(result.publishGapBand).toBe("first_post");
    expect(result.learningEligible).toBe(false);
  });

  it("maps learned safe bands to conservative target intervals", () => {
    expect(cadenceBandTargetHours("under_6h")).toBeNull();
    expect(cadenceBandTargetHours("h_6_20")).toBe(20);
    expect(cadenceBandTargetHours("h_20_36")).toBe(28);
    expect(cadenceBandTargetHours("h_36_72")).toBe(48);
  });
});
