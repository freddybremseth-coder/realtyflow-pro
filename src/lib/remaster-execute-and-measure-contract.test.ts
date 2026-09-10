import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsPath = "src/services/growth/remaster-autopilot-settings.ts";
const routePath = "src/app/api/neural-beat/autopilot-settings/route.ts";
const runPath = "src/app/api/neural-beat/autopilot-run/route.ts";
const optimizerPath = "src/services/growth/remaster-growth-optimizer.ts";

test("Re-Master supports guarded execution with metadata writes enabled only in that mode", async () => {
  const [settings, route, run] = await Promise.all([
    readFile(settingsPath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(runPath, "utf8"),
  ]);
  assert.match(settings, /"execute_guarded"/);
  assert.match(settings, /allowMetadataUpdates: mode === "execute_guarded"/);
  assert.match(route, /body\.mode === "execute_guarded"/);
  assert.match(route, /Titler og thumbnails forblir manuelle/);
  assert.match(run, /executeMetadataRecommendation/);
  assert.match(run, /newTitle: null/);
  assert.match(run, /settings\.mode !== "execute_guarded" \|\| !settings\.allowMetadataUpdates/);
  assert.match(run, /executedCount\+\+/);
});

test("Re-Master metadata optimizer rejects malformed AI output and uses provider fallback", async () => {
  const optimizer = await readFile(optimizerPath, "utf8");
  assert.match(optimizer, /responseMimeType: "application\/json"/);
  assert.match(optimizer, /validateResponse: isValidMetadataResponse/);
  assert.match(optimizer, /fallbackOnInvalidResponse: true/);
});
