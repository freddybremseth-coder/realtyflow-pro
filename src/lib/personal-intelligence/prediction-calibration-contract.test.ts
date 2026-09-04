import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/predictions/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/predictions/page.tsx"), "utf8");

test("predictions are owner-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
});

test("prediction creation is explicit and probability is bounded", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /probability 0-1 are required/);
  assert.match(route, /status: "open"/);
});

test("resolution is explicit and only open predictions can resolve", () => {
  assert.match(route, /export async function PATCH/);
  assert.match(route, /Only open predictions can be resolved/);
  assert.doesNotMatch(route, /deadline.*status.*resolved/s);
});

test("calibration is transparent and prediction-level", () => {
  assert.match(route, /1 - Math\.pow\(p - outcome, 2\)/);
  assert.match(route, /metric: "1 - \(p - outcome\)\^2"/);
  assert.match(page, /not a score of you as a person/i);
});

test("no AI prediction generation or aggregate person score", () => {
  assert.doesNotMatch(route, /askClaude|OpenAI|Gemini|anthropic/i);
  assert.doesNotMatch(route, /person_score|overall_score|aggregate_score/i);
});
