import { describe, expect, it } from "vitest";
import {
  OWNED_GROWTH_BRANDS,
  OWNED_GROWTH_BRAND_IDS,
  growthBrandDefinition,
  isPilotChannel,
} from "./brand-registry";

describe("Marketing Growth OS owned brand registry", () => {
  it("keeps owned brand ids unique and Soleada outside the owned Growth OS brands", () => {
    expect(new Set(OWNED_GROWTH_BRAND_IDS).size).toBe(OWNED_GROWTH_BRAND_IDS.length);
    expect(OWNED_GROWTH_BRAND_IDS).not.toContain("soleada");
    expect(growthBrandDefinition("soleada")).toBeNull();
  });

  it("uses remasterfreddy as the canonical Re-master Freddy brand id", () => {
    expect(OWNED_GROWTH_BRAND_IDS).toContain("remasterfreddy");
    expect(growthBrandDefinition("remasterfreddy")?.name).toBe("Re-Master Freddy");
    expect(growthBrandDefinition("neuralbeat")).toBeNull();
  });

  it("does not mark new creator and product channels pilot-ready before write governance is hardened", () => {
    expect(isPilotChannel("freddyb", "youtube")).toBe(false);
    expect(isPilotChannel("freddypublishing", "facebook")).toBe(false);
    expect(isPilotChannel("freddyai", "facebook")).toBe(false);
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

  it("defines Freddy Bremseth as the professional expertise umbrella and excludes the private Facebook profile from automation", () => {
    const brand = growthBrandDefinition("freddyb");
    expect(brand?.kind).toBe("personal");
    expect(brand?.contentPillars).toContain("expertise_and_analysis");
    expect(brand?.contentPillars).toContain("selected_brand_stories");
    expect(brand?.notes).toMatch(/professional umbrella\/expertise brand/i);
    expect(brand?.notes).toMatch(/private Facebook profile is not an automated commercial publishing destination/i);
  });

  it("defines Freddy Publishing as a separate publishing brand", () => {
    const brand = growthBrandDefinition("freddypublishing");
    expect(brand?.kind).toBe("publishing");
    expect(brand?.website).toBe("https://books.freddybremseth.com");
    expect(brand?.contentPillars).toContain("sample_chapters");
    expect(brand?.primaryCtas).toContain("browse_catalog");
  });

  it("defines Freddy AI Products separately for RealtyFlow, Nexus OS and future AI products", () => {
    const brand = growthBrandDefinition("freddyai");
    expect(brand?.kind).toBe("saas");
    expect(brand?.contentPillars).toContain("realtyflow");
    expect(brand?.contentPillars).toContain("nexus_os");
    expect(brand?.pilotChannels).toEqual([]);
  });

  it("keeps a planned channel footprint for every owned brand", () => {
    for (const brand of OWNED_GROWTH_BRANDS) {
      expect(brand.plannedChannels.length, brand.id).toBeGreaterThan(0);
    }
  });
});
