import assert from "node:assert/strict";
import test from "node:test";

import { fetchInstagramMediaEngagement } from "./instagram-insights";

test("combines Instagram media counters and Insights metrics", async () => {
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = String(input);
    if (url.includes("/insights")) {
      return Response.json({
        data: [
          { name: "reach", values: [{ value: 900 }] },
          { name: "views", values: [{ value: 1200 }] },
          { name: "saved", values: [{ value: 17 }] },
          { name: "shares", values: [{ value: 8 }] },
          { name: "total_interactions", values: [{ value: 80 }] },
        ],
      });
    }
    return Response.json({ id: "media-1", media_type: "VIDEO", like_count: 50, comments_count: 5 });
  }) as typeof fetch;

  const result = await fetchInstagramMediaEngagement("media-1", "secret", { fetcher });
  assert.equal(result.views, 1200);
  assert.equal(result.reach, 900);
  assert.equal(result.likes, 50);
  assert.equal(result.comments, 5);
  assert.equal(result.saves, 17);
  assert.equal(result.shares, 8);
  assert.equal(result.totalInteractions, 80);
});

test("keeps supported metrics when Meta rejects a combined metric request", async () => {
  const fetcher = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/insights")) {
      return Response.json({ id: "media-2", like_count: 4, comments_count: 2 });
    }
    const metric = url.searchParams.get("metric") || "";
    if (metric.includes(",") || metric === "impressions") {
      return Response.json({ error: { message: "Unsupported metric" } }, { status: 400 });
    }
    const values: Record<string, number> = { reach: 100, views: 130, plays: 125, saved: 3, shares: 2, total_interactions: 11 };
    return Response.json({ data: [{ name: metric, values: [{ value: values[metric] ?? 0 }] }] });
  }) as typeof fetch;

  const result = await fetchInstagramMediaEngagement("media-2", "secret", { fetcher });
  assert.equal(result.views, 130);
  assert.equal(result.reach, 100);
  assert.equal(result.impressions, 0);
  assert.equal(result.totalInteractions, 11);
});
