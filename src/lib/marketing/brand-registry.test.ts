import assert from "node:assert/strict";
import test from "node:test";
import {
  OWNED_GROWTH_BRANDS,
  OWNED_GROWTH_BRAND_IDS,
  growthBrandDefinition,
  isMetaGrowthChannel,
  isPilotChannel,
} from "./brand-registry";

test("keeps owned brand ids unique and Soleada outside the owned Growth OS brands", () => {
    assert.equal(new Set(OWNED_GROWTH_BRAND_IDS).size, OWNED_GROWTH_BRAND_IDS.length);
    assert.ok(!OWNED_GROWTH_BRAND_IDS.some((id) => id === "soleada"));
    assert.equal(growthBrandDefinition("soleada"), null);
  });

test("uses remasterfreddy as the canonical Re-master Freddy brand id", () => {
    assert.ok(OWNED_GROWTH_BRAND_IDS.includes("remasterfreddy"));
    assert.equal(growthBrandDefinition("remasterfreddy")?.name, "Re-Master Freddy");
    assert.equal(growthBrandDefinition("neuralbeat"), null);
  });

test("does not mark non-Meta creator and product channels pilot-ready before write governance is hardened", () => {
    assert.equal(isPilotChannel("freddyb", "youtube"), false);
    assert.equal(isPilotChannel("remasterfreddy", "youtube"), false);
    assert.equal(isPilotChannel("donaanna", "youtube"), false);
    assert.equal(isPilotChannel("chatgenius", "youtube"), false);
    assert.equal(isPilotChannel("chatgenius", "linkedin"), false);
  });

test("keeps currently controlled Meta pilots enabled", () => {
    assert.equal(isPilotChannel("zeneco", "instagram"), true);
    assert.equal(isPilotChannel("zeneco", "facebook"), true);
    assert.equal(isPilotChannel("pinosoecolife", "instagram"), true);
    assert.equal(isPilotChannel("pinosoecolife", "facebook"), true);
    assert.equal(isPilotChannel("donaanna", "instagram"), true);
    assert.equal(isPilotChannel("donaanna", "facebook"), true);
    assert.equal(isPilotChannel("chatgenius", "instagram"), true);
    assert.equal(isPilotChannel("chatgenius", "facebook"), true);
    assert.equal(isPilotChannel("freddyb", "instagram"), true);
    assert.equal(isPilotChannel("freddypublishing", "instagram"), true);
    assert.equal(isPilotChannel("freddypublishing", "facebook"), true);
    assert.equal(isPilotChannel("freddyai", "instagram"), true);
    assert.equal(isPilotChannel("freddyai", "facebook"), true);
    assert.equal(isPilotChannel("remasterfreddy", "instagram"), true);
    assert.equal(isPilotChannel("remasterfreddy", "facebook"), true);
  });

test("identifies the current controlled Growth OS publisher channels", () => {
    assert.equal(isMetaGrowthChannel("instagram"), true);
    assert.equal(isMetaGrowthChannel("facebook"), true);
    assert.equal(isMetaGrowthChannel("youtube"), false);
    assert.equal(isMetaGrowthChannel("linkedin"), false);
    assert.equal(isMetaGrowthChannel("email"), false);
  });

test("defines Freddy Bremseth as the professional expertise umbrella and excludes the private Facebook profile from automation", () => {
    const brand = growthBrandDefinition("freddyb");
    assert.equal(brand?.kind, "personal");
    assert.ok(brand?.contentPillars?.includes("expertise_and_analysis"));
    assert.ok(brand?.contentPillars?.includes("selected_brand_stories"));
    assert.match(brand?.notes || "", /professional umbrella\/expertise brand/i);
    assert.match(brand?.notes || "", /private Facebook profile is not an automated commercial publishing destination/i);
  });

test("defines Freddy Publishing as a separate publishing brand", () => {
    const brand = growthBrandDefinition("freddypublishing");
    assert.equal(brand?.kind, "publishing");
    assert.equal(brand?.website, "https://books.freddybremseth.com");
    assert.ok(brand?.contentPillars?.includes("sample_chapters"));
    assert.ok(brand?.primaryCtas?.includes("browse_catalog"));
  });

test("defines Freddy AI Products separately for RealtyFlow, Nexus OS and future AI products", () => {
    const brand = growthBrandDefinition("freddyai");
    assert.equal(brand?.kind, "saas");
    assert.ok(brand?.contentPillars?.includes("realtyflow"));
    assert.ok(brand?.contentPillars?.includes("nexus_os"));
    assert.deepEqual(brand?.pilotChannels, ["instagram", "facebook"]);
  });

test("keeps a planned channel footprint for every owned brand", () => {
    for (const brand of OWNED_GROWTH_BRANDS) {
      assert.ok(brand.plannedChannels.length > 0, brand.id);
    }
  });
