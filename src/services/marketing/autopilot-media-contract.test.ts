import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const media = fs.readFileSync(
  path.join(process.cwd(), "src/services/marketing/autopilot-media.ts"),
  "utf8",
);
const organization = fs.readFileSync(
  path.join(process.cwd(), "src/services/media/organization.ts"),
  "utf8",
);

describe("Growth OS Instagram Media Studio bridge", () => {
  it("uses the canonical RealtyFlow Media Studio tenant instead of a hard-coded UUID", () => {
    expect(media).toContain("getDefaultMediaOrganizationId");
    expect(organization).toContain("export async function getDefaultMediaOrganizationId");
    expect(media).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("creates an idempotent 4:5 Instagram image through the existing job service", () => {
    expect(media).toContain("createMediaJob");
    expect(media).toContain('platform: "instagram"');
    expect(media).toContain('mediaType: "image"');
    expect(media).toContain('aspectRatio: "4:5"');
    expect(media).toContain('qualityTier: "balanced"');
    expect(media).toContain("growth-instagram-media:");
  });

  it("requires a completed public HTTPS asset and keeps visual claims conservative", () => {
    expect(media).toContain('String(job.status) !== "completed"');
    expect(media).toContain("public_url");
    expect(media).toContain("/^https:\\/\\//i");
    expect(media).toContain("Do not invent a product interface");
    expect(media).toContain("Do not include readable text");
  });
});
