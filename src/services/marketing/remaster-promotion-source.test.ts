import { describe, expect, it } from "vitest";
import { pickRemasterPromotionSource, remasterPromotionMasterIdea, remasterPromotionMediaUrl, remasterPromotionTitleFamily, type RemasterPromotionSource } from "./remaster-promotion-source";

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
    expect(picked?.id).toBe("new");
  });

  it("respects channel and cooldown", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "recent", last_planned_at: "2026-09-01T00:00:00Z" }),
      source({ id: "wrong-channel", source_id: "song-2", recommended_channels: ["instagram"], last_planned_at: null }),
      source({ id: "eligible", source_id: "song-3", last_planned_at: "2026-07-01T00:00:00Z" }),
    ], "facebook", now, 14);
    expect(picked?.id).toBe("eligible");
  });

  it("blocks sibling uploads in the same recently planned title family", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "neuro-old", source_id: "song-1", title: "Neuro Pulse", last_planned_at: "2026-09-01T00:00:00Z" }),
      source({ id: "neuro-sibling", source_id: "song-2", title: "Neuro Pulse", source_url: "https://www.youtube.com/watch?v=def456", payload: { youtube_url: "https://www.youtube.com/watch?v=def456" }, last_planned_at: null }),
      source({ id: "other", source_id: "song-3", title: "Road Signal", last_planned_at: null }),
    ], "facebook", now, 14);
    expect(picked?.id).toBe("other");
  });

  it("normalizes malformed and clean Dale title variants into the same family", () => {
    expect(remasterPromotionTitleFamily("Â¡Dale a tu Cuerpo!")).toBe(remasterPromotionTitleFamily("¡Dale a tu Cuerpo!"));
  });

  it("allows a sibling family again when the family cooldown has expired", () => {
    const now = Date.parse("2026-09-05T12:00:00Z");
    const picked = pickRemasterPromotionSource([
      source({ id: "neuro-old", source_id: "song-1", title: "Neuro Pulse", last_planned_at: "2026-07-01T00:00:00Z" }),
      source({ id: "neuro-sibling", source_id: "song-2", title: "Neuro Pulse", source_url: "https://www.youtube.com/watch?v=def456", payload: { youtube_url: "https://www.youtube.com/watch?v=def456" }, last_planned_at: null }),
    ], "facebook", now, 14);
    expect(picked?.id).toBe("neuro-sibling");
  });

  it("requires a verified YouTube destination", () => {
    const picked = pickRemasterPromotionSource([
      source({ source_url: null, payload: { artist: "Re-Master Freddy" } }),
    ], "facebook");
    expect(picked).toBeNull();
  });

  it("builds a source-locked idea and uses verified artwork", () => {
    const row = source();
    const idea = remasterPromotionMasterIdea(row, " Favor learned timing.");
    expect(idea).toContain("Night Signal");
    expect(idea).toContain("https://www.youtube.com/watch?v=abc123");
    expect(idea).toContain("Do not invent streaming numbers");
    expect(idea).toContain("Do not replace the selected song");
    expect(remasterPromotionMediaUrl(row)).toBe("https://example.com/art.jpg");
  });
});
