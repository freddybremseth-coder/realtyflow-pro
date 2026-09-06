import assert from "node:assert/strict";
import { test } from "node:test";

import { summarizeRemasterAnalytics } from "@/services/growth/remaster-analytics-observation";
import type { RemasterAnalyticsVideoRow } from "@/services/integrations/remaster-youtube-analytics";

function row(videoId: string, views: number, retention: number, likes = 0, comments = 0, shares = 0): RemasterAnalyticsVideoRow {
  return {
    videoId,
    views,
    estimatedMinutesWatched: 0,
    averageViewDuration: 0,
    averageViewPercentage: retention,
    likes,
    comments,
    shares,
    subscribersGained: 0,
    subscribersLost: 0,
  };
}

test("videos below minimum evidence remain insufficient", () => {
  const summary = summarizeRemasterAnalytics([
    row("small", 19, 90, 10, 10, 10),
    row("a", 100, 50, 5),
    row("b", 100, 50, 5),
  ]);
  const small = summary.observations.find((item) => item.videoId === "small");
  assert.equal(small?.watchQuality, "INSUFFICIENT_DATA");
  assert.equal(small?.engagementQuality, "INSUFFICIENT_DATA");
  assert.equal(summary.eligibleVideos, 2);
  assert.equal(summary.insufficientVideos, 1);
});

test("quality bands are relative to the Re-Master cohort", () => {
  const summary = summarizeRemasterAnalytics([
    row("low", 100, 30, 1),
    row("mid", 100, 50, 5),
    row("high", 100, 70, 10),
  ]);
  assert.equal(summary.cohort.medianAverageViewPercentage, 50);
  assert.equal(summary.cohort.medianEngagementRatePct, 5);
  assert.equal(summary.observations.find((item) => item.videoId === "low")?.watchQuality, "BELOW_COHORT");
  assert.equal(summary.observations.find((item) => item.videoId === "mid")?.watchQuality, "NEAR_COHORT");
  assert.equal(summary.observations.find((item) => item.videoId === "high")?.watchQuality, "ABOVE_COHORT");
});

test("observation model does not manufacture growth actions", () => {
  const summary = summarizeRemasterAnalytics([row("a", 100, 50, 5)]);
  assert.equal("action" in summary, false);
  assert.equal("recommendedAction" in summary.observations[0], false);
});
