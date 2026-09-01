import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const focusRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/book-growth/experiments/focus/route.ts"), "utf8");
const experimentContext = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/experiments-focus-context.tsx"), "utf8");
const learningContext = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/learning-focus-context.tsx"), "utf8");
const learningPage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/book-growth/learning/page.tsx"), "utf8");

test("learning eligibility mirrors phase 5.3 repeated evidence threshold", () => {
  assert.match(focusRoute, /row\.status === "completed"/);
  assert.match(focusRoute, /row\.evidence_level === "directional"/);
  assert.match(focusRoute, /rows\.length >= 3/);
  assert.match(focusRoute, /eligibleLearningGroups/);
  assert.match(focusRoute, /learningEligible/);
});

test("experiment context links to Learning Center only when repeated evidence is eligible", () => {
  assert.match(experimentContext, /focus\?\.learningEligible && focus\.learningHref/);
  assert.match(experimentContext, /Open repeated evidence in Learning Proposal Center/);
  assert.doesNotMatch(experimentContext, /publishing_generate_learning_proposals/);
  assert.doesNotMatch(experimentContext, /method:\s*"POST"/);
});

test("focused Learning context is read-only and cannot generate or decide proposals", () => {
  assert.match(learningContext, /\/api\/book-growth\/learning/);
  assert.match(learningContext, /proposal_type === "improvement"/);
  assert.doesNotMatch(learningContext, /method:\s*"POST"/);
  assert.doesNotMatch(learningContext, /action:\s*"generate"/);
  assert.doesNotMatch(learningContext, /action:\s*"decide"/);
});

test("existing Learning Center retains explicit generation and decision actions", () => {
  assert.match(learningPage, /onClick=\{\(\)=>act\(\{action:"generate"\}\)\}/);
  assert.match(learningPage, /action:"decide"/);
  assert.match(learningPage, /ingen regler, metadata eller bøker ble opprettet/i);
  assert.match(learningPage, /Godkjenning betyr «dette bør vurderes videre»/);
});
