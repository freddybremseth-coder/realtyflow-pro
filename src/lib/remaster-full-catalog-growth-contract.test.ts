import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/remaster-growth-loop/route.ts"), "utf8");
const youtube = fs.readFileSync(path.join(process.cwd(), "src/services/integrations/remaster-youtube-actions.ts"), "utf8");

describe("Re-Master full catalog growth contract", () => {
  it("covers the complete current catalog while keeping a two-video write guardrail", () => {
    expect(route).toContain("const FULL_CATALOG_LIMIT = 250");
    expect(route).toContain("const MAX_VIDEOS_PER_RUN = 2");
    expect(route).toContain("listRemasterChannelVideos(FULL_CATALOG_LIMIT)");
    expect(route).toContain(".slice(0, MAX_VIDEOS_PER_RUN)");
  });

  it("filters cooldown eligibility before consuming candidate slots", () => {
    const filterIndex = route.indexOf("const candidates = underperforming.filter");
    const cooldownIndex = route.indexOf('!hasRecentAction(history, video.videoId, "update_metadata", 14)', filterIndex);
    const sliceIndex = route.indexOf(".slice(0, MAX_VIDEOS_PER_RUN)", filterIndex);
    expect(filterIndex).toBeGreaterThanOrEqual(0);
    expect(cooldownIndex).toBeGreaterThan(filterIndex);
    expect(sliceIndex).toBeGreaterThan(cooldownIndex);
  });

  it("uses uploads-playlist pagination and batched statistics reads instead of a one-page search", () => {
    expect(youtube).toContain("relatedPlaylists?.uploads");
    expect(youtube).toContain("client.playlistItems.list");
    expect(youtube).toContain("chunks(ids, 50)");
    expect(youtube).not.toContain("client.search.list");
  });

  it("logs a growth-loop heartbeat and keeps high-risk creative changes disabled", () => {
    expect(route).toContain('action: "remaster_growth_loop"');
    expect(route).toContain("automaticTitleChanges: false");
    expect(route).toContain("automaticThumbnailChanges: false");
  });
});
