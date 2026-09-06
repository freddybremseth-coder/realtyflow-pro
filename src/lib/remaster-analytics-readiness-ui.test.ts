import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const pagePath = fileURLToPath(new URL("../app/(content)/remaster-freddy/page.tsx", import.meta.url));

test("Re-Master Growth Health surfaces YouTube Analytics readiness", async () => {
  const page = await readFile(pagePath, "utf8");
  assert.match(page, /analyticsReady/);
  assert.match(page, /Analytics ready/);
  assert.match(page, /Reconnect YouTube for Analytics/);
  assert.match(page, /brand_id=remasterfreddy&service=youtube/);
  assert.match(page, /yt-analytics\.readonly/);
});
