import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remasterReelPerformanceScore } from "./remaster-reel-learning";

describe("Re-Master Reel performance learning", () => {
  it("weights high-intent engagement above passive reactions", () => {
    const reactionsOnly = remasterReelPerformanceScore({ impressions: 1000, reactions: 10 });
    const shares = remasterReelPerformanceScore({ impressions: 1000, shares: 10 });
    const saves = remasterReelPerformanceScore({ views: 1000, saves: 10 });
    assert.ok(shares > reactionsOnly);
    assert.ok(saves > reactionsOnly);
  });

  it("normalizes performance per thousand views or impressions", () => {
    const a = remasterReelPerformanceScore({ impressions: 1000, reactions: 10, shares: 2 });
    const b = remasterReelPerformanceScore({ impressions: 2000, reactions: 20, shares: 4 });
    assert.equal(a, b);
  });

  it("returns zero for a Reel with no engagement", () => {
    assert.equal(remasterReelPerformanceScore({ views: 500 }), 0);
  });
});
