import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/interview/page.tsx"), "utf8");

test("life interview reuses zero-write Orientation extraction", () => {
  assert.match(page, /\/api\/personal-intelligence\/orientation\/candidates/);
  assert.match(page, /writesPerformed !== 0/);
  assert.match(page, /Extraction reuses Orientation and performs zero database writes/i);
});

test("life interview only persists through explicit confirm routes", () => {
  assert.match(page, /\/api\/personal-intelligence\/memory\/confirm/);
  assert.match(page, /\/api\/personal-intelligence\/goals\/confirm/);
  assert.match(page, /> Remember</);
  assert.match(page, /> Drop</);
});

test("goal capture preserves idea-not-commitment semantics", () => {
  assert.match(page, /stores it as an idea, not an active commitment/i);
});

test("life interview avoids hidden personality scoring and autonomous execution", () => {
  assert.doesNotMatch(page, /personality_score|overall_score|destination_system|external_action_id/i);
});

test("life interview covers history, experience, values, curiosity, knowledge and future", () => {
  for (const section of ["History", "Experience", "Values", "Curiosity", "Knowledge", "Future"]) assert.match(page, new RegExp(section));
});
