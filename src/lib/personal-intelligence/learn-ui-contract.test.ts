import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const topicsRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/learning/topics/route.ts"), "utf8");
const lessonRoute = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/learning/lesson/route.ts"), "utf8");
const learnPage = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/learn/page.tsx"), "utf8");
const layout = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/layout.tsx"), "utf8");

test("LEARN catalogue is owner-only and reads topics/mastery through service mediation", () => {
  assert.match(topicsRoute, /access\.role !== "OWNER"/);
  assert.match(topicsRoute, /schema\("knowledge"\)\.from\("topics"\)/);
  assert.match(topicsRoute, /schema\("knowledge"\)\.from\("mastery"\)/);
  assert.match(topicsRoute, /schema\("learning"\)\.from\("review_schedule"\)/);
});

test("unknown mastery remains unknown rather than being treated as zero knowledge", () => {
  assert.match(lessonRoute, /No mastery record exists\. Treat prior knowledge as unknown, not low\./);
  assert.match(lessonRoute, /Unknown evidence remains unknown/);
  assert.match(learnPage, /Prior knowledge unknown/);
  assert.match(learnPage, /Unknown/);
});

test("Professor lesson adapts from evidence without writing mastery directly", () => {
  assert.match(lessonRoute, /exposure_score,understanding_score,retention_score,transfer_score/);
  assert.match(lessonRoute, /Hook -> Core concept -> Concrete example -> Connection to real-world use -> One check question -> Teach-back prompt/);
  assert.doesNotMatch(lessonRoute, /\.update\(/);
  assert.doesNotMatch(lessonRoute, /\.upsert\(/);
  assert.doesNotMatch(lessonRoute, /\.insert\(/);
});

test("LEARN uses existing learning session and teach-back evidence flow", () => {
  assert.match(learnPage, /\/api\/personal-intelligence\/learning\/session/);
  assert.match(learnPage, /\/api\/personal-intelligence\/learning\/lesson/);
  assert.match(learnPage, /\/api\/personal-intelligence\/learning\/teach-back/);
  assert.match(learnPage, /Teach-back evidence recorded/);
  assert.match(learnPage, /does not automatically declare the topic mastered/);
});

test("LEARN supports editable dictation and avoids gamification mechanics", () => {
  assert.match(learnPage, /DictationButton/);
  assert.match(learnPage, /Speak your teach-back; edit before submitting/);
  assert.doesNotMatch(learnPage, /streak/i);
  assert.doesNotMatch(learnPage, /points/i);
  assert.doesNotMatch(learnPage, /leaderboard/i);
});

test("Personal Intelligence navigation exposes Learn beside Mentor and Reflect", () => {
  assert.match(layout, /href="\/personal-intelligence\/learn"/);
  assert.match(layout, />Learn</);
  assert.match(layout, /href="\/personal-intelligence\/reflect"/);
});
