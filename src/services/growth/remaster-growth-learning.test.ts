import { describe, expect, it } from "vitest";
import { positiveMetadataTags, summarizeRemasterActionLearning } from "./remaster-growth-learning";
import type { RemasterActionHistoryRow } from "./remaster-action-history";

function row(actionType: string, outcome: string, liftPct: number, tags: string[] = []): RemasterActionHistoryRow {
  return {
    id: `${actionType}-${outcome}-${liftPct}-${tags.join("-")}`,
    brand: "remasterfreddy",
    action_type: actionType,
    platform: "youtube",
    content: "test",
    hypothesis: "test",
    expected_outcome: "growth",
    priority: 5,
    status: "completed",
    learnings: JSON.stringify({ action: { newTags: tags }, feedback: { outcome, liftPct } }),
    executed_at: "2026-08-01T00:00:00.000Z",
    reviewed_at: "2026-08-08T00:00:00.000Z",
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-08T00:00:00.000Z",
  };
}

describe("summarizeRemasterActionLearning", () => {
  it("keeps exploring until there are at least two measured outcomes", () => {
    expect(summarizeRemasterActionLearning([row("update_metadata", "POSITIVE", 30)], "update_metadata").mode).toBe("EXPLORE");
  });

  it("favors repeated positive evidence with meaningful lift", () => {
    const result = summarizeRemasterActionLearning([
      row("update_metadata", "POSITIVE", 24),
      row("update_metadata", "POSITIVE", 16),
    ], "update_metadata");
    expect(result.mode).toBe("FAVOR");
    expect(result.averageLiftPct).toBe(20);
  });

  it("suppresses repeated negative outcomes without positive evidence", () => {
    const result = summarizeRemasterActionLearning([
      row("add_to_playlist", "NEGATIVE", -25),
      row("add_to_playlist", "NEGATIVE", -12),
    ], "add_to_playlist");
    expect(result.mode).toBe("SUPPRESS");
  });

  it("keeps mixed evidence neutral", () => {
    const result = summarizeRemasterActionLearning([
      row("update_metadata", "POSITIVE", 18),
      row("update_metadata", "NEGATIVE", -9),
    ], "update_metadata");
    expect(result.mode).toBe("NEUTRAL");
  });
});

describe("positiveMetadataTags", () => {
  it("returns only tags repeated across positive measured actions", () => {
    const tags = positiveMetadataTags([
      row("update_metadata", "POSITIVE", 20, ["ambient music", "study music"]),
      row("update_metadata", "POSITIVE", 15, ["ambient music", "focus music"]),
      row("update_metadata", "NEGATIVE", -20, ["bad tag", "ambient music"]),
    ]);
    expect(tags).toEqual([{ tag: "ambient music", count: 2 }]);
  });
});
