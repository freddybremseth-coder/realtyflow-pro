import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(path.resolve(process.cwd(), "src/app/api/nexus/profile-activation-priority/route.ts"), "utf8");

test("profile activation priority reuses governed persona scoring", () => {
  assert.match(source, /prioritizePersonaBackfill/);
  assert.match(source, /DIRECT_APPROVAL_CONFIDENCE = 80/);
  assert.match(source, /READY_TO_APPROVE/);
  assert.match(source, /REVIEW_REQUIRED/);
  assert.match(source, /DISCOVERY_REQUIRED/);
});

test("profile activation priority remains read-only", () => {
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /sendEmail|sendBrandEmail/);
});
