import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const executiveRoute = fileURLToPath(new URL("./route.ts", import.meta.url));
const weeklyRoute = fileURLToPath(new URL("../command/weekly-management-review/route.ts", import.meta.url));

test("Executive Briefing uses responsibility-aware team capacity", async () => {
  const source = await readFile(executiveRoute, "utf8");
  assert.match(source, /loadWorkspaceTeamCoreSnapshot/);
  assert.doesNotMatch(source, /schema\("core"\)/);
  assert.match(source, /responsibilityLoadByEmail/);
  assert.match(source, /buildTeamCapacityForecast/);
  assert.match(source, /buildTeamCapacityTrend/);
  assert.match(source, /capacityForecast,/);
  assert.match(source, /capacityTrend,/);
});

test("Weekly Management Review reads the same Executive capacity outlook without new capacity writes", async () => {
  const source = await readFile(weeklyRoute, "utf8");
  assert.match(source, /GET as getExecutiveBriefing/);
  assert.match(source, /loadCurrentCapacity/);
  assert.match(source, /capacity: capacity\.capacity/);
  assert.doesNotMatch(source, /capacity.*upsert/i);
  assert.doesNotMatch(source, /capacity.*insert/i);
  assert.doesNotMatch(source, /capacity.*update/i);
  assert.doesNotMatch(source, /capacity.*delete/i);
});
