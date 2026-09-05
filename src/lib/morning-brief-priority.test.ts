import assert from "node:assert/strict";
import { test } from "node:test";
import { rankMorningBriefPriorities, scoreMorningBriefPriority } from "@/lib/morning-brief-priority";

test("priority score rewards impact and owner-required work without ignoring urgency", () => {
  const score = scoreMorningBriefPriority({
    id: "decision",
    urgency: 70,
    impact: 100,
    deadlineOrIrreversibility: 80,
    ownerRequired: 100,
  });

  assert.equal(score.score, 86);
});

test("priority inputs are clamped to a safe 0-100 range", () => {
  const score = scoreMorningBriefPriority({
    id: "clamped",
    urgency: 140,
    impact: -10,
    deadlineOrIrreversibility: Number.NaN,
    ownerRequired: 110,
  });

  assert.equal(score.urgency, 100);
  assert.equal(score.impact, 0);
  assert.equal(score.deadlineOrIrreversibility, 0);
  assert.equal(score.ownerRequired, 100);
  assert.equal(score.score, 50);
});

test("ranking is deterministic when two candidates have the same score", () => {
  const ranked = rankMorningBriefPriorities([
    { id: "b", urgency: 80, impact: 80, deadlineOrIrreversibility: 80, ownerRequired: 80 },
    { id: "a", urgency: 80, impact: 80, deadlineOrIrreversibility: 80, ownerRequired: 80 },
  ]);

  assert.deepEqual(ranked.map((entry) => entry.item.id), ["a", "b"]);
});
