import { describe, expect, it } from "vitest";
import {
  OWNED_GROWTH_BRAND_IDS,
  growthBrandDefinition,
  isPilotChannel,
} from "./brand-registry";

describe("Marketing Growth OS owned brand registry", () => {
  it("keeps Soleada outside the owned Growth OS brands", () => {
    expect(OWNED_GROWTH_BRAND_IDS).not.toContain("soleada");
    expect(growthBrandDefinition("soleada")).toBeNull();
  });

  it("uses remasterfreddy as the canonical Re-master Freddy brand id", () => {
    expect(OWNED_GROWTH_BRAND_IDS).toContain("remasterfreddy");
    expect(growthBrandDefinition("remasterfreddy")?.name).toBe("Re-master Freddy");
    expect(growthBrandDefinition("neuralbeat")).toBeNull();
  });

  it("does not mark YouTube pilot-ready before write governance is hardened", () => {
    expect(isPilotChannel("freddyb", "youtube")).toBe(false);
    expect(isPilotChannel("remasterfreddy", "youtube")).toBe(false);
    expect(isPilotChannel("donaanna", "youtube")).toBe(false);
    expect(isPilotChannel("chatgenius", "youtube")).toBe(false);
  });

  it("keeps currently controlled Meta pilots enabled", () => {
    expect(isPilotChannel("zeneco", "instagram")).toBe(true);
    expect(isPilotChannel("zeneco", "facebook")).toBe(true);
    expect(isPilotChannel("pinosoecolife", "facebook")).toBe(true);
    expect(isPilotChannel("donaanna", "instagram")).toBe(true);
    expect(isPilotChannel("chatgenius", "instagram")).toBe(true);
  });

  it("locks Freddy Bremseth to three explicit personal-brand pillars", () => {
    expect(growthBrandDefinition("freddyb")?.contentPillars).toEqual([
      "author_and_books",
      "spain_and_property_advisory",
      "analysis_knowledge_and_entrepreneurship",
    ]);
  });
});
