import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const decisions = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/decisions/route.ts"), "utf8");
const analyze = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/decisions/analyze/route.ts"), "utf8");
const choose = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/decisions/choose/route.ts"), "utf8");
const outcome = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/decisions/outcome/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/think/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/layout.tsx"), "utf8");

test("THINK Decision Journal routes remain owner-only", () => {
  for (const source of [decisions, analyze, choose, outcome]) assert.match(source, /access\.role !== "OWNER"/);
  assert.match(decisions, /getPersonalIntelligenceOwnerUserId/);
  assert.match(analyze, /subject_entity_id/);
  assert.match(choose, /subject_entity_id/);
  assert.match(outcome, /subject_entity_id/);
});

test("strategic and life decisions require explicit alternatives", () => {
  assert.match(decisions, /decisionType === "strategic" \|\| decisionType === "life"/);
  assert.match(decisions, /validOptions\.length < 2/);
  assert.match(decisions, /require at least two explicit alternatives/);
});

test("AI decision analysis is read-only, non-binding and non-persistent", () => {
  assert.match(analyze, /persisted: false/);
  assert.match(analyze, /binding: false/);
  assert.doesNotMatch(analyze, /\.insert\(/);
  assert.doesNotMatch(analyze, /\.update\(/);
  assert.doesNotMatch(analyze, /\.upsert\(/);
  assert.doesNotMatch(analyze, /\.delete\(/);
  assert.match(analyze, /Never present a recommendation as an order/);
});

test("only an explicit owner choice records the chosen option", () => {
  assert.match(choose, /chosen_option_id: option\.id/);
  assert.match(choose, /status: "decided"/);
  assert.match(choose, /decided_at: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(analyze, /chosen_option_id:/);
  assert.match(page, /AI analysis cannot choose\. Only your explicit click can record a choice\./);
  assert.match(page, /Choose explicitly/);
});

test("outcome review separates decision quality, outcome quality and luck", () => {
  assert.match(outcome, /decision_quality: decisionQuality/);
  assert.match(outcome, /outcome_quality: outcomeQuality/);
  assert.match(outcome, /luck_factor: luckFactor/);
  assert.match(page, /Decision quality %/);
  assert.match(page, /Outcome quality %/);
  assert.match(page, /Luck factor %/);
});

test("partial outcome failures clean up the inserted review", () => {
  assert.match(outcome, /from\("decision_outcomes"\)\.delete\(\)/);
  assert.match(outcome, /inserted outcome was removed/);
});

test("Decision Journal captures uncertainty, premortem and assumptions before deciding", () => {
  assert.match(decisions, /uncertainty_notes/);
  assert.match(decisions, /premortem/);
  assert.match(decisions, /scenario_notes/);
  assert.match(decisions, /decision_assumptions/);
  assert.match(page, /Assumption register/);
  assert.match(page, /Premortem: if this fails, why\?/);
});

test("THINK exposes decision analysis without autonomous external execution", () => {
  assert.match(page, /Non-binding analysis/);
  assert.match(page, /does not choose or execute anything/);
  assert.doesNotMatch(decisions, /fetch\("https?:\/\//);
  assert.doesNotMatch(choose, /fetch\("https?:\/\//);
  assert.doesNotMatch(outcome, /fetch\("https?:\/\//);
});

test("Personal Intelligence navigation exposes Think", () => {
  assert.match(layout, /href="\/personal-intelligence\/think"/);
  assert.match(layout, />Think</);
});
