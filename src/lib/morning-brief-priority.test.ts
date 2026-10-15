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

test("missing operational deadline never inherits an invented irreversible score", async () => {
  const { operationalPriorityEvidence } = await import("@/lib/morning-brief-priority");
  const item = operationalPriorityEvidence({ severity: "high", score: 96, responsibility: "USER" });
  assert.equal(item.deadlineOrIrreversibility, 40);
  assert.equal(item.ownerRequired, 75);
  const background = operationalPriorityEvidence({ severity: "high", score: 96, responsibility: "SYSTEM" });
  assert.equal(background.ownerRequired, 20);
});
test("long-overdue personal deadlines are stale evidence, not endless emergency flags", async () => {
  const { personalDeadlineScore, isStalePersonalDeadline } = await import("@/lib/morning-brief-priority");
  const now = new Date("2026-10-15T09:00:00Z");
  assert.equal(personalDeadlineScore("2026-08-28T09:32:16Z", now), 45);
  assert.equal(isStalePersonalDeadline("2026-08-28T09:32:16Z", now), true);
  assert.equal(personalDeadlineScore("2026-10-15T12:00:00Z", now), 90);
  assert.equal(personalDeadlineScore(null, now), 45);
});
