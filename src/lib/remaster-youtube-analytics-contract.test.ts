import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const servicePath = fileURLToPath(new URL("../services/integrations/remaster-youtube-analytics.ts", import.meta.url));
const routePath = fileURLToPath(new URL("../app/api/remaster/analytics/route.ts", import.meta.url));

async function source(path: string) {
  return readFile(path, "utf8");
}

test("analytics reader fails closed until readonly scope is granted", async () => {
  const service = await source(servicePath);
  assert.match(service, /yt-analytics\.readonly/);
  assert.match(service, /state: "NOT_READY"/);
  assert.match(service, /tokens\.scopes\.includes\(ANALYTICS_SCOPE\)/);
  assert.match(service, /brand_id=remasterfreddy/);
});

test("analytics reader is read-only and requests watch-quality metrics", async () => {
  const service = await source(servicePath);
  assert.match(service, /google\.youtubeAnalytics/);
  assert.match(service, /reports\.query/);
  assert.match(service, /averageViewDuration/);
  assert.match(service, /averageViewPercentage/);
  assert.match(service, /estimatedMinutesWatched/);
  assert.doesNotMatch(service, /method:\s*["']POST["']/);
  assert.doesNotMatch(service, /videos\.update/);
  assert.doesNotMatch(service, /thumbnails\.set/);
});

test("analytics endpoint remains admin protected and no-store", async () => {
  const route = await source(routePath);
  assert.match(route, /requireAdminApi/);
  assert.match(route, /readRemasterYouTubeAnalytics/);
  assert.match(route, /Cache-Control.*no-store/);
});
