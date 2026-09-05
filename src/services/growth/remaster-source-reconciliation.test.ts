import { describe, expect, it } from "vitest";
import { desiredRemasterSource, REMASTER_PENDING_REASON, remasterSourceNeedsUpdate, type RemasterSongRow, type RemasterSourceRow } from "./remaster-source-reconciliation";

function song(overrides: Partial<RemasterSongRow> = {}): RemasterSongRow {
  return {
    id: "song-1",
    name: "Test Track",
    artist: "Re-Master Freddy",
    genre: "Electronic",
    mood: "uplifting",
    file_url: "https://example.com/test.mp3",
    status: "published",
    youtube_url: null,
    brand: "remasterfreddy",
    style: "melodic",
    energy: "medium",
    image_url: "https://example.com/image.jpg",
    thumbnail_url: null,
    ai_metadata: { tags: ["electronic"] },
    ...overrides,
  };
}

function source(overrides: Partial<RemasterSourceRow> = {}): RemasterSourceRow {
  return {
    brand_id: "remasterfreddy",
    source_type: "song",
    source_id: "song-1",
    source_url: null,
    title: "Test Track",
    priority: 55,
    recommended_channels: ["instagram", "facebook"],
    payload: {},
    status: "pending",
    blocked_reason: REMASTER_PENDING_REASON,
    ...overrides,
  };
}

describe("Re-Master source reconciliation", () => {
  it("keeps an unpublished song pending", () => {
    const desired = desiredRemasterSource(song());
    expect(desired.status).toBe("pending");
    expect(desired.priority).toBe(55);
    expect(desired.blocked_reason).toBe(REMASTER_PENDING_REASON);
    expect(desired.source_url).toBeNull();
  });

  it("promotes a newly published song from pending to ready", () => {
    const desired = desiredRemasterSource(
      song({ youtube_url: "https://www.youtube.com/watch?v=abc123" }),
      source(),
    );
    expect(desired.status).toBe("ready");
    expect(desired.priority).toBe(78);
    expect(desired.blocked_reason).toBeNull();
    expect(desired.source_url).toContain("youtube.com");
    expect(desired.payload.youtube_url).toContain("youtube.com");
  });

  it("preserves a downstream drafted workflow status", () => {
    const desired = desiredRemasterSource(
      song({ youtube_url: "https://www.youtube.com/watch?v=abc123" }),
      source({ status: "drafted", blocked_reason: null }),
    );
    expect(desired.status).toBe("drafted");
  });

  it("preserves a manual block but clears the system publication block after YouTube publish", () => {
    const manual = desiredRemasterSource(
      song({ youtube_url: "https://www.youtube.com/watch?v=abc123" }),
      source({ status: "blocked", blocked_reason: "Manual review required" }),
    );
    expect(manual.status).toBe("blocked");
    expect(manual.blocked_reason).toBe("Manual review required");

    const automatic = desiredRemasterSource(
      song({ youtube_url: "https://www.youtube.com/watch?v=abc123" }),
      source({ status: "blocked", blocked_reason: REMASTER_PENDING_REASON }),
    );
    expect(automatic.status).toBe("ready");
    expect(automatic.blocked_reason).toBeNull();
  });

  it("detects payload/status drift idempotently", () => {
    const desired = desiredRemasterSource(song(), source());
    expect(remasterSourceNeedsUpdate(source(), desired)).toBe(true);
    expect(remasterSourceNeedsUpdate({ ...source(), payload: desired.payload }, desired)).toBe(false);
  });
});
