import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const adapter = fs.readFileSync(
  path.join(process.cwd(), "src/lib/personal-intelligence/nexus-business-adapter.ts"),
  "utf8",
);
const today = fs.readFileSync(
  path.join(process.cwd(), "src/lib/personal-intelligence/today-service.ts"),
  "utf8",
);

test("Nexus adapter reuses Revenue Command Center intelligence", () => {
  assert.match(adapter, /loadNexusRevenueCommandSnapshot/);
  assert.match(adapter, /topMissions/);
  assert.match(adapter, /criticalPipelines/);
  assert.match(adapter, /atRiskPipelines/);
});

test("Nexus business context is read-only and never canonical personal memory", () => {
  assert.match(adapter, /persistAsPersonalMemory:\s*false/);
  assert.match(adapter, /outboundActions:\s*false/);
  assert.match(today, /persistAsPersonalMemory:\s*false/);
  assert.doesNotMatch(adapter, /personal_core.*insert/i);
  assert.doesNotMatch(adapter, /mentor.*insert/i);
});

test("TODAY degrades gracefully when Nexus is unavailable", () => {
  assert.match(today, /loadNexusBusinessMentorSummary\(supabase\)\.then/);
  assert.match(today, /Nexus business context unavailable/);
  assert.match(today, /type:\s*"business_opportunity"/);
});
