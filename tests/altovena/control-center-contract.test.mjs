import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../../src/app/(realty)/altovena-launch/page.tsx", import.meta.url), "utf8");

test("Altovena Control Center retains real OWNER/session boundaries", () => {
  assert.match(page, /verifyAdminSession/);
  assert.match(page, /session\.role !== "OWNER"/);
  assert.match(page, /isAdminEmail\(session\.email\)/);
  assert.match(page, /verifyWorkspacePreviewSession/);
  assert.match(page, /redirect\("\/workspaces"\)/);
});

test("Control Center is explicitly a dated snapshot, not live telemetry or release permission", () => {
  assert.match(page, /Altovena Control Center/);
  assert.match(page, /19\.10\.2026/);
  assert.match(page, /ikke live GitHub-/i);
  assert.match(page, /ikke en sanntidstest/i);
  assert.match(page, /Ingen kontroller eller lanseringer utføres/);
  assert.doesNotMatch(page, /fetch\s*\(|supabase|POST\s*\(|createClient\s*\(/);
});

test("Each P0 product card has a persistent ID, next step and evidence link", () => {
  for (const id of ["AV-006", "AV-007", "AV-008", "AV-002", "AV-003", "AV-010"]) {
    assert.ok(page.includes(`id: "${id}"`), `Missing ${id}`);
  }
  assert.match(page, /product\.next/);
  assert.match(page, /product\.url/);
  assert.match(page, /Altovena\/pull\/7/);
  assert.match(page, /rel="noopener noreferrer"/);
});
