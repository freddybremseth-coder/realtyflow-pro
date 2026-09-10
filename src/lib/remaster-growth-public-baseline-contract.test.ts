import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath = "src/services/integrations/remaster-youtube-actions.ts";

test("Re-Master growth catalog only includes public YouTube videos", async () => {
  const source = await readFile(actionsPath, "utf8");
  assert.match(source, /part: \["snippet", "statistics", "status"\]/);
  assert.match(source, /item\.status\?\.privacyStatus !== "public"/);
  assert.match(source, /privacyStatus: item\.status\?\.privacyStatus \|\| "unknown"/);
});
