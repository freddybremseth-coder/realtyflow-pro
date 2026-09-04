import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/context-usage/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/context/page.tsx"), "utf8");

test("context usage review is owner-only and read-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /context_usage/);
  assert.match(route, /\.eq\("owner_user_id", ownerUserId\)/);
  assert.match(route, /writesPerformed: 0/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test("context transparency exposes audit reasons without hidden reasoning", () => {
  assert.match(route, /context_reason/);
  assert.match(route, /sensitivity/);
  assert.match(route, /confidence/);
  assert.match(route, /noHiddenChainOfThought: true/);
  assert.match(page, /does not expose or store hidden chain-of-thought/);
  assert.doesNotMatch(page, /chain of thought:/i);
});
