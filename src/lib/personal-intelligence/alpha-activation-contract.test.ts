import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/start/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/layout.tsx"), "utf8");

test("Start Here reads existing ME onboarding state without manufacturing profile data", () => {
  assert.match(page, /\/api\/personal-intelligence\/me/);
  assert.match(page, /onboardingState/);
  assert.match(page, /empty/);
  assert.match(page, /fake seed-data/i);
  assert.doesNotMatch(page, /method:\s*["']POST["']/);
  assert.doesNotMatch(page, /insert\(|update\(|upsert\(|delete\(/);
});

test("activation sequence is explicit and preserves existing confirmation boundaries", () => {
  assert.match(page, /\/personal-intelligence\/orient/);
  assert.match(page, /\/personal-intelligence\/interview/);
  assert.match(page, /\/personal-intelligence\/map/);
  assert.match(page, /\/personal-intelligence["']/);
  assert.match(page, /does not.*write/i);
  assert.match(page, /explicit/i);
});

test("Start Here is directly reachable from Personal Intelligence navigation", () => {
  assert.match(layout, /href="\/personal-intelligence\/start"/);
  assert.match(layout, />Start<\/Link>/);
});
