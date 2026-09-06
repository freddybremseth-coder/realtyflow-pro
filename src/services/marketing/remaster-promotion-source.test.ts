import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickRemasterPromotionSource, remasterPromotionMasterIdea, remasterPromotionMediaUrl, remasterPromotionTitleFamily, remasterYoutubeVideoId, type RemasterPromotionSource } from "./remaster-promotion-source";

function source(overrides: Partial<RemasterPromotionSource> = {}): RemasterPromotionSource {
  return {
    id: "queue-1",
    source_id: "song-1",
    source_url: "https://www.youtube.com/watch?v=abc123",
    title: "Night Signal",
    priority: 78,
    recommended_channels: ["facebook", "instagram"],
    payload: {
      youtube_url: "https://www.youtube.com/watch?v=abc123",
      artist: "Re-Master Freddy",
      genre: "Electronic",
      mood: "night drive",
      image_url: "https://example.com/art.jpg",
    },
    status: "ready",
    last_planned_at: null,
    ...overrides,
  };
}

describe("Re-Master promotion source", () => {
  it("prefers never-planned eligible songs", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "old", title: "Older", last_planned_at: "2026-08-01T00:00:00Z" }),
      source({ id: "new", title: "Never planned", source_id: "song-2", last_planned_at: null }),
    ], "facebook", now, 14);
    assert.equal(picked?.id, "new");
  });

  it("respects channel and cooldown", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "recent", title: "Recent Signal", last_planned_at: "2026-09-01T00:00:00Z" }),
      source({ id: "wrong-channel", source_id: "song-2", title: "Wrong Channel Signal", recommended_channels: ["instagram"], last_planned_at: null }),
      source({ id: "eligible", source_id: "song-3", title: "Eligible Signal", last_planned_at: "2026-07-01T00:00:00Z" }),
    ], "facebook", now, 14);
    assert.equal(picked?.id, "eligible");
  });

  it("blocks sibling uploads in the same recently planned title family", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "neuro-old", source_id: "song-1", title: "Neuro Pulse", last_planned_at: "2026-09-01T00:00:00Z" }),
      source({ id: "neuro-sibling", source_id: "song-2", title: "Neuro Pulse", source_url: "https://www.youtube.com/watch?v=def456", payload: { youtube_url: "https://www.youtube.com/watch?v=def456" }, last_planned_at: null }),
      source({ id: "other", source_id: "song-3", title: "Road Signal", last_planned_at: null }),
    ], "facebook", now, 14);
    assert.equal(picked?.id, "other");
  });

  it("normalizes malformed and clean Dale title variants into the same family", () => {
    assert.equal(remasterPromotionTitleFamily("Â¡Dale a tu Cuerpo!"), remasterPromotionTitleFamily("¡Dale a tu Cuerpo!"));
  });

  it("allows a sibling family again when the family cooldown has expired", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "neuro-old", source_id: "song-1", title: "Neuro Pulse", last_planned_at: "2026-07-01T00:00:00Z" }),
      source({ id: "neuro-sibling", source_id: "song-2", title: "Neuro Pulse", source_url: "https://www.youtube.com/watch?v=def456", payload: { youtube_url: "https://www.youtube.com/watch?v=def456" }, last_planned_at: null }),
    ], "facebook", now, 14);
    assert.equal(picked?.id, "neuro-sibling");
  });

  it("requires a verified YouTube destination", () => {
    const picked = pickRemasterPromotionSource([
      source({ source_url: null, payload: { artist: "Re-Master Freddy" } }),
    ], "facebook");
    assert.equal(picked, null);
  });

  it("builds a source-locked idea and prefers stable YouTube artwork", () => {
    const row = source();
    const idea = remasterPromotionMasterIdea(row, " Favor learned timing.");
    assert.ok(idea.includes("Night Signal"));
    assert.ok(idea.includes("https://www.youtube.com/watch?v=abc123"));
    assert.ok(idea.includes("Do not invent streaming numbers"));
    assert.ok(idea.includes("Do not replace the selected song"));
    assert.equal(remasterYoutubeVideoId(row), "abc123");
    assert.equal(remasterPromotionMediaUrl(row), "https://i.ytimg.com/vi/abc123/hqdefault.jpg");
  });

  it("extracts verified YouTube ids from short and shorts URLs", () => {
    assert.equal(remasterYoutubeVideoId(source({ source_url: "https://youtu.be/short123", payload: {} })), "short123");
    assert.equal(remasterYoutubeVideoId(source({ source_url: "https://www.youtube.com/shorts/shorts456", payload: {} })), "shorts456");
  });

  it("falls back to stored artwork only when the destination is not a parsable YouTube URL", () => {
    const row = source({ source_url: "https://example.com/listen", payload: { image_url: "https://example.com/art.jpg" } });
    assert.equal(remasterYoutubeVideoId(row), null);
    assert.equal(remasterPromotionMediaUrl(row), "https://example.com/art.jpg");
  });
});
