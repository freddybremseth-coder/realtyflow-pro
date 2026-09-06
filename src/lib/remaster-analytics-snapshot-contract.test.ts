import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const routePath = fileURLToPath(new URL("../app/api/cron/remaster-analytics-snapshot/route.ts", import.meta.url));
const vercelPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));

async function source(path: string) {
  return readFile(path, "utf8");
}

test("analytics snapshot cron fails closed until Analytics is ready", async () => {
  const route = await source(routePath);
  assert.match(route, /analytics\.state === "NOT_READY"/);
  assert.match(route, /youtube_analytics_not_ready/);
  assert.match(route, /skipped: true/);
});

test("analytics snapshots reuse the canonical engagement snapshot table with a daily duplicate guard", async () => {
  const route = await source(routePath);
  assert.match(route, /engagement_snapshots/);
  assert.match(route, /snapshot_at/);
  assert.match(route, /utcDayStart/);
  assert.match(route, /existingIds/);
  assert.match(route, /metric_window: METRIC_WINDOW/);
  assert.match(route, /source: SNAPSHOT_SOURCE/);
});

test("snapshot collection remains observation-only", async () => {
  const route = await source(routePath);
  assert.doesNotMatch(route, /recordCompletedRemasterAction/);
  assert.doesNotMatch(route, /updateRemasterVideoMetadata/);
  assert.doesNotMatch(route, /addRemasterVideoToPlaylist/);
  assert.doesNotMatch(route, /createRemasterPlaylist/);
  assert.doesNotMatch(route, /thumbnails\.set/);
});

test("Vercel schedules Analytics snapshots before the daily Re-Master growth loop", async () => {
  const vercel = await source(vercelPath);
  const snapshot = vercel.indexOf('"/api/cron/remaster-analytics-snapshot"');
  const growth = vercel.indexOf('"/api/cron/remaster-growth-loop"');
  assert.ok(snapshot >= 0);
  assert.ok(growth > snapshot);
  assert.match(vercel, /remaster-analytics-snapshot\", \"schedule\": \"20 19 \* \* \*\"/);
});
