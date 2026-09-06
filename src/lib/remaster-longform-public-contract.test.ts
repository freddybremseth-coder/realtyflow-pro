import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const worker = fs.readFileSync(
  path.join(process.cwd(), "src/services/pipelines/remaster-mix-worker.ts"),
  "utf8",
);
const youtube = fs.readFileSync(
  path.join(process.cwd(), "src/services/integrations/remaster-youtube-longform.ts"),
  "utf8",
);
const reconcileRoute = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/cron/remaster-youtube-public-reconcile/route.ts"),
  "utf8",
);

describe("Re-Master long-form production privacy", () => {
  it("forces autonomous long-form uploads to YouTube public", () => {
    expect(worker).toContain('return "public" as const;');
    expect(worker).toContain("privacyStatus: mixPrivacy()");
    expect(youtube).toContain('const privacyStatus = input.privacyStatus || "public";');
  });

  it("fails closed if YouTube does not verify the upload as public", () => {
    expect(worker).toContain('if (upload.privacyStatus !== "public")');
    expect(worker).toContain("YOUTUBE_LONGFORM_NOT_PUBLIC");
    expect(youtube).toContain('if (after !== "public")');
  });

  it("does not fall back to private for the autonomous mix worker", () => {
    expect(worker).not.toContain('REMASTER_MIX_YOUTUBE_PRIVACY || "private"');
  });

  it("can reconcile already-completed Re-Master mixes to public", () => {
    expect(youtube).toContain("ensureRemasterLongFormPublic");
    expect(reconcileRoute).toContain('.eq("status", "completed")');
    expect(reconcileRoute).toContain("ensureRemasterLongFormPublic(videoId)");
    expect(reconcileRoute).toContain('action: "remaster_youtube_public_reconcile"');
  });
});
