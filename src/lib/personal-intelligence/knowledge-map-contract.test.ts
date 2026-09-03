import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/knowledge/map/route.ts"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/personal-intelligence/map/page.tsx"), "utf8");

test("knowledge map is owner-only", () => {
  assert.match(route, /access\.role !== "OWNER"/);
});

test("topic mapping never manufactures mastery", () => {
  assert.match(route, /masteryCreated: false/);
  assert.doesNotMatch(route, /from\("mastery"\)\.insert|from\("mastery"\)\.upsert/);
  assert.match(page, /Ingen mastery-rad eller kunnskapsscore opprettes/i);
});

test("missing mastery is explicitly unknown rather than zero", () => {
  assert.match(route, /missingMasteryMeans: "unknown"/);
  assert.match(page, /unknown — not zero/i);
  assert.doesNotMatch(page, /0%.*unknown/i);
});

test("mapped topics preserve owner-confirmed discovery provenance in metadata", () => {
  assert.match(route, /owner_confirmed_knowledge_discovery/);
  assert.match(route, /direct_user_statement/);
  assert.match(route, /source_excerpt/);
  assert.match(route, /topic mapping does not imply mastery/);
});

test("knowledge map is not an autonomous learning or execution system", () => {
  assert.doesNotMatch(route, /askClaude|destination_system|external_action_id/);
  assert.doesNotMatch(route, /understanding_score:\s*[0-9]|retention_score:\s*[0-9]|transfer_score:\s*[0-9]/);
});
