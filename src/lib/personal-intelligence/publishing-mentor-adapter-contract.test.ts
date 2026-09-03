import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const adapter = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/publishing-mentor-adapter.ts"), "utf8");
const today = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/today-service.ts"), "utf8");

test("Publishing Mentor Adapter reuses canonical Book OS workflow intelligence", () => {
  assert.match(adapter, /bookCockpitStatus/);
  assert.match(adapter, /publisherCockpitTargets/);
  assert.match(adapter, /publishing_book_projects/);
  assert.match(adapter, /publishing_distribution_publications/);
  assert.match(adapter, /publishing_distribution_jobs/);
  assert.match(adapter, /publishing_learning_proposals/);
});

test("publishing context is read-only and cannot become personal memory automatically", () => {
  assert.match(adapter, /readOnly: true/);
  assert.match(adapter, /persistAsPersonalMemory: false/);
  assert.match(adapter, /outboundActions: false/);
  assert.doesNotMatch(adapter, /\.insert\(/);
  assert.doesNotMatch(adapter, /\.update\(/);
  assert.doesNotMatch(adapter, /\.upsert\(/);
  assert.doesNotMatch(adapter, /\.delete\(/);
});

test("TODAY consumes only top publishing attention signals and degrades gracefully", () => {
  assert.match(today, /loadPublishingMentorSummary/);
  assert.match(today, /type: "publishing_attention"/);
  assert.match(today, /topAttention\.slice\(0, 2\)/);
  assert.match(today, /persistAsPersonalMemory: false/);
  assert.match(today, /Book OS context unavailable/);
});
