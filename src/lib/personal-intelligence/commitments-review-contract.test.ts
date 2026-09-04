import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/commitments/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/commitments/page.tsx"), "utf8");

test("commitments review is owner-only and GET is read-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /writesPerformed: 0/);
});

test("idea is not commitment and goal direction is separate from execution", () => {
  assert.match(route, /ideaIsNotCommitment: true/);
  assert.match(route, /activeGoalIsDirectionNotExecution: true/);
  assert.match(page, /Direction is not commitment/i);
});

test("commitment status changes require explicit owner PATCH", () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /explicitOwnerAction: true/);
  assert.match(page, /method:"PATCH"/);
});

test("review uses existing goal and action lifecycles without AI promotion", () => {
  assert.match(route, /schema\("personal_core"\).*from\("goals"\)/s);
  assert.match(route, /schema\("mentor"\).*from\("actions"\)/s);
  assert.doesNotMatch(route + page, /askClaude|personality_score|overall_score|auto.?promot/i);
});
