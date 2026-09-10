import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPath = "src/services/growth/remaster-autopilot-settings.ts";
const routePath = "src/app/api/neural-beat/autopilot-settings/route.ts";
const optimizerPath = "src/services/growth/remaster-growth-optimizer.ts";

test("Re-Master supports guarded execution with metadata writes enabled only in that mode", async () => {
  const [settings, route] = await Promise.all([
    readFile(settingsPath, "utf8"),
    readFile(routePath, "utf8"),
  ]);
  assert.match(settings, /"execute_guarded"/);
  assert.match(settings, /allowMetadataUpdates: mode === "execute_guarded"/);
  assert.match(route, /body\.mode === "execute_guarded"/);
  assert.match(route, /Titler og thumbnails forblir manuelle/);
});

test("Re-Master metadata optimizer rejects malformed AI output and uses provider fallback", async () => {
  const optimizer = await readFile(optimizerPath, "utf8");
  assert.match(optimizer, /responseMimeType: "application\/json"/);
  assert.match(optimizer, /validateResponse: isValidMetadataResponse/);
  assert.match(optimizer, /fallbackOnInvalidResponse: true/);
});
