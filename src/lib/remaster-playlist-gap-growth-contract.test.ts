import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const growthRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/cron/remaster-growth-loop/route.ts"), "utf8");
const youtubeActions = fs.readFileSync(path.join(process.cwd(), "src/services/integrations/remaster-youtube-actions.ts"), "utf8");


describe("Re-Master playlist gap growth contract", () => {
  it("requires evidence and keeps playlist creation low frequency", () => {
    expect(growthRoute).toContain("PLAYLIST_CREATE_COOLDOWN_DAYS = 30");
    expect(growthRoute).toContain("minimumTracks: 3");
    expect(growthRoute).toContain("slice(0, MAX_VIDEOS_PER_RUN)");
    expect(growthRoute).toContain("findRemasterPlaylistGap");
  });

  it("uses canonical song taxonomy rather than inventing playlist themes", () => {
    expect(growthRoute).toContain('from("songs").select("name,genre,mood,style,youtube_url,brand")');
    expect(growthRoute).toContain("taxonomyRows");
    expect(growthRoute).toContain("youtubeVideoId(row.youtube_url)");
  });

  it("creates only on the verified Re-Master YouTube client and checks duplicate titles", () => {
    expect(youtubeActions).toContain("export async function createRemasterPlaylist");
    expect(youtubeActions).toContain("const { client, channelId, channelTitle } = await getVerifiedClient()");
    expect(youtubeActions).toContain("duplicate: true");
    expect(youtubeActions).toContain('privacyStatus: "public"');
  });

  it("does not introduce playlist deletion or rename automation", () => {
    expect(growthRoute).toContain("automaticPlaylistDeletion: false");
    expect(growthRoute).toContain("automaticPlaylistRename: false");
    expect(youtubeActions).not.toContain("playlists.delete");
    expect(youtubeActions).not.toContain("playlists.update");
  });
});
