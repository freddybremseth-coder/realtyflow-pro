import assert from "node:assert/strict";
import test from "node:test";
import { assessRemasterVideoPerformance, median } from "./remaster-growth-loop";

const NOW = Date.UTC(2026, 8, 5, 12, 0, 0);

function video(overrides: Partial<Parameters<typeof assessRemasterVideoPerformance>[0]> = {}) {
  return {
    videoId: "v1",
    title: "Test track",
    publishedAt: new Date(NOW - 10 * 86_400_000).toISOString(),
    viewCount: 600,
    likeCount: 30,
    commentCount: 5,
    description: "x".repeat(1200),
    tags: Array.from({ length: 18 }, (_, i) => `tag-${i}`),
    ...overrides,
  };
}

test("healthy video is not changed", () => {
  const result = assessRemasterVideoPerformance(video(), 50, NOW);
  assert.equal(result.status, "HEALTHY");
  assert.deepEqual(result.actions, []);
});

test("new videos remain in watch mode", () => {
  const result = assessRemasterVideoPerformance(video({ publishedAt: new Date(NOW - 2 * 86_400_000).toISOString(), viewCount: 5 }), 50, NOW);
  assert.equal(result.status, "WATCH");
  assert.deepEqual(result.actions, []);
});

test("underperforming mature video gets reversible growth actions", () => {
  const result = assessRemasterVideoPerformance(video({ viewCount: 40, likeCount: 0, commentCount: 0, description: "short", tags: ["music"] }), 50, NOW);
  assert.equal(result.status, "UNDERPERFORMING");
  assert.deepEqual(result.actions, ["ADD_TO_PLAYLIST", "REFRESH_DESCRIPTION", "REFRESH_TAGS"]);
});

test("median is deterministic", () => {
  assert.equal(median([10, 2, 30, 20]), 15);
  assert.equal(median([3, 1, 2]), 2);
});
