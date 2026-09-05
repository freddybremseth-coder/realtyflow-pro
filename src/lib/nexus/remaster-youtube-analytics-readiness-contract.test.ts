import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const oauthPath = fileURLToPath(new URL("../../app/api/oauth/google/route.ts", import.meta.url));
const healthPath = fileURLToPath(new URL("../../services/integrations/youtube-health.ts", import.meta.url));

async function read(path: string) {
  return readFile(path, "utf8");
}

test("YouTube OAuth requests readonly Analytics scope", async () => {
  const source = await read(oauthPath);
  assert.match(source, /https:\/\/www\.googleapis\.com\/auth\/yt-analytics\.readonly/);
  assert.match(source, /include_granted_scopes/);
});

test("YouTube health reports Analytics readiness from stored token scopes", async () => {
  const source = await read(healthPath);
  assert.match(source, /YOUTUBE_ANALYTICS_SCOPE/);
  assert.match(source, /analyticsReady: hasAnalyticsScope\(candidate\.scopes\)/);
  assert.match(source, /scopes: tokens\?\.scopes \?\? \[\]/);
});

test("legacy token fallback never claims Analytics readiness", async () => {
  const source = await read(healthPath);
  assert.match(source, /results\.push\(\{ source: `brand:\$\{candidateBrandId\}`, refreshToken, scopes: \[\] \}\)/);
  assert.match(source, /analyticsReady: false/);
});
