import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const candidatesRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/orientation/candidates/route.ts"), "utf8");
const goalRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/goals/confirm/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/orient/page.tsx"), "utf8");

test("orientation extraction is owner-only and does not write memory", () => {
  assert.match(candidatesRoute, /access\.role !== "OWNER"/);
  assert.match(candidatesRoute, /extractMemoryCandidates\(item\.answer\)/);
  assert.match(candidatesRoute, /writesPerformed: 0/);
  assert.doesNotMatch(candidatesRoute, /\.insert\(|\.update\(|createConfirmedClaim/);
});

test("orientation forces explicit confirmation for every candidate", () => {
  assert.match(candidatesRoute, /persistence: "CONFIRM" as const/);
  assert.match(page, /CONFIRM required/);
  assert.match(page, /Remember/);
});

test("orientation candidate types stay evidence-safe", () => {
  assert.match(candidatesRoute, /"fact", "goal", "preference", "belief", "interest"/);
  assert.doesNotMatch(candidatesRoute, /reflection_insight.*ALLOWED_TYPES/);
});

test("goals are confirmed explicitly with direct-user provenance and remain ideas", () => {
  assert.match(goalRoute, /direct_user_statement/);
  assert.match(goalRoute, /direct_current_user_confirmation/);
  assert.match(goalRoute, /status: "idea"/);
  assert.doesNotMatch(goalRoute, /status: "active"/);
  assert.match(page, /Mål lagres først som idé, aldri som commitment/);
});

test("orientation reuses canonical claim confirmation rather than parallel memory storage", () => {
  assert.match(page, /\/api\/personal-intelligence\/memory\/confirm/);
  assert.match(page, /\/api\/personal-intelligence\/goals\/confirm/);
});
