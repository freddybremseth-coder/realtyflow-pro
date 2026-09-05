import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const routePath = fileURLToPath(new URL("../../app/api/os/status/route.ts", import.meta.url));

async function source() {
  return readFile(routePath, "utf8");
}

test("Re-Master health is excluded from generic automation failure counts", async () => {
  const route = await source();
  assert.match(route, /DEDICATED_ATTENTION_AUTOMATIONS = new Set\(\["remaster_health_monitor"\]\)/);
  assert.match(route, /genericAutomationLogs = automationLogs\.filter/);
  assert.match(route, /automationFailures = genericAutomationLogs\.filter/);
  assert.match(route, /automationPartial = genericAutomationLogs\.filter/);
});

test("Re-Master attention is emitted only for partial or error health", async () => {
  const route = await source();
  assert.match(route, /\["partial", "error"\]\.includes\(lastRemasterHealthStatus\)/);
  assert.doesNotMatch(route, /\["success", "partial", "error"\]\.includes\(lastRemasterHealthStatus\)/);
});

test("Re-Master health attention deep-links to the canonical Growth OS page", async () => {
  const route = await source();
  assert.match(route, /id: "remaster:health"/);
  assert.match(route, /href: "\/remaster-freddy"/);
  assert.match(route, /source: "Re-Master Health"/);
});
