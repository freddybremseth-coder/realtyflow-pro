import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const reels = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/reels/route.ts"), "utf8");
const publish = fs.readFileSync(path.join(process.cwd(), "src/app/api/workspaces/[brandKey]/reels/publish/route.ts"), "utf8");
const policy = fs.readFileSync(path.join(process.cwd(), "src/lib/workspaces/brand-policy.ts"), "utf8");

describe("workspace Reels security contract", () => {
  it("requires explicit brand Reel permissions", () => {
    expect(reels).toContain('requireBrandWorkspace(request, brandKey, "reels.read")');
    expect(reels).toContain('requireBrandWorkspace(request, brandKey, "reels.create")');
    expect(publish).toContain('requireBrandWorkspace(request, brandKey, "reels.publish")');
    expect(policy).toContain('"reels.read"');
    expect(policy).toContain('"reels.create"');
    expect(policy).toContain('"reels.publish"');
  });

  it("keeps the first employee surface limited to Zen and Pinoso", () => {
    expect(reels).toContain('new Set(["zeneco", "pinosoecolife"])');
    expect(publish).toContain('new Set(["zeneco", "pinosoecolife"])');
  });

  it("never accepts a client-selected brand for render or publish", () => {
    expect(reels).not.toContain("brand: z.enum");
    expect(reels).toContain('.eq("brand", brandKey)');
    expect(publish).toContain('.eq("id", jobId).eq("brand", brandKey)');
  });

  it("publishes only Facebook and Instagram from the workspace route", () => {
    expect(reels).toContain('z.array(z.enum(["instagram", "facebook"]))');
    expect(publish).toContain('z.enum(["instagram", "facebook"])');
    expect(publish).not.toContain("uploadVideo(");
  });

  it("reserves a delivery before any external publication", () => {
    const reserve = publish.indexOf('.from("remaster_reel_deliveries").insert');
    const instagram = publish.indexOf("publisher.publish");
    const facebook = publish.indexOf("publishFacebookPageReel");
    expect(reserve).toBeGreaterThan(-1);
    expect(instagram).toBeGreaterThan(reserve);
    expect(facebook).toBeGreaterThan(reserve);
    expect(publish).toContain('state: "needs_review"');
  });
});
