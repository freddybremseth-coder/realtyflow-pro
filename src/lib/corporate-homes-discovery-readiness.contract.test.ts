import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runner = fs.readFileSync("src/lib/corporate-homes-discovery-runner.ts", "utf8");

test("Corporate Homes discovery auto-stages only to RESEARCHED", () => {
  assert.match(runner, /status:\s*"RESEARCHED"/);
  assert.match(runner, /human_qualification_required:\s*true/);
  assert.doesNotMatch(runner, /status:\s*"QUALIFIED"/);
});

test("Corporate Homes discovery still forbids personal enrichment and outreach", () => {
  assert.match(runner, /personal_contact_enrichment:\s*false/);
  assert.match(runner, /outreach_started:\s*false/);
});
