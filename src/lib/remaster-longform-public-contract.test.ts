import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/services/pipelines/remaster-mix-worker.ts"),
  "utf8",
);

describe("Re-Master long-form production privacy", () => {
  it("forces autonomous long-form uploads to YouTube public", () => {
    expect(source).toContain('return "public" as const;');
    expect(source).toContain("privacyStatus: mixPrivacy()");
  });

  it("fails closed if YouTube does not verify the upload as public", () => {
    expect(source).toContain('if (upload.privacyStatus !== "public")');
    expect(source).toContain("YOUTUBE_LONGFORM_NOT_PUBLIC");
  });

  it("does not fall back to private for the mix worker", () => {
    expect(source).not.toContain('REMASTER_MIX_YOUTUBE_PRIVACY || "private"');
  });
});
