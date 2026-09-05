import { describe, expect, it } from "vitest";
import { findRemasterPlaylistGap } from "./remaster-playlist-gap";

const rows = [
  { videoId: "a", title: "A", genre: "EDM", mood: "Euphoric, uplifting", style: "melodic trance" },
  { videoId: "b", title: "B", genre: "Electronic", mood: "euphoric", style: "melodic trance" },
  { videoId: "c", title: "C", genre: "Electronic Dance Music", mood: "uplifting", style: "melodic trance" },
  { videoId: "d", title: "D", genre: "House", mood: "chill", style: "deep house" },
];

describe("findRemasterPlaylistGap", () => {
  it("normalizes taxonomy and proposes a specific missing cluster", () => {
    const result = findRemasterPlaylistGap(rows, []);
    expect(result).not.toBeNull();
    expect(result?.videoIds.length).toBeGreaterThanOrEqual(3);
    expect(result?.title).toContain("Re-Master Freddy");
  });

  it("does not duplicate an existing playlist that already covers the cluster", () => {
    const result = findRemasterPlaylistGap(rows, [{ playlistId: "p1", title: "Re-Master Freddy — Melodic Trance" }]);
    expect(result?.label).not.toBe("melodic trance");
  });

  it("requires at least three matching tracks", () => {
    const result = findRemasterPlaylistGap(rows.slice(0, 2), []);
    expect(result).toBeNull();
  });

  it("collapses EDM/electronic/electronic dance music into one genre family", () => {
    const result = findRemasterPlaylistGap(rows.slice(0, 3), [{ playlistId: "p1", title: "Melodic Trance" }, { playlistId: "p2", title: "Euphoric" }]);
    expect(result?.label).toBe("electronic dance music");
    expect(result?.videoIds).toEqual(["a", "b", "c"]);
  });
});
