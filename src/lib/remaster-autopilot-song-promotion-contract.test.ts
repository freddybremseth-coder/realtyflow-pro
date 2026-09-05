import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/marketing-autopilot/route.ts"), "utf8");
const selector = fs.readFileSync(path.join(process.cwd(), "src/services/marketing/remaster-promotion-source.ts"), "utf8");

describe("Re-Master exact-song Marketing Autopilot", () => {
  it("selects a canonical song source only for the Re-Master creator role", () => {
    expect(route).toContain('brandId === "remasterfreddy" && role === "creator_media"');
    expect(route).toContain("loadRemasterPromotionSource");
    expect(route).toContain("remasterPromotionMasterIdea");
    expect(route).toContain("remasterPromotionMediaUrl");
  });

  it("marks a source planned only after campaign generation has a non-error result", () => {
    expect(route).toContain("const generated = run.results.some((item) => !item.error)");
    expect(route).toContain("if (remasterSource && generated)");
    expect(route).toContain("markRemasterPromotionSourcePlanned");
  });

  it("rotates sources with a 14 day cooldown and requires verified YouTube", () => {
    expect(route).toContain("cooldownDays: 14");
    expect(selector).toContain("payload?.youtube_url");
    expect(selector).toContain("last_planned_at");
    expect(selector).toContain("recommended_channels");
  });
});
