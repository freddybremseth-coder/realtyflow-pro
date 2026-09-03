import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtime = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/mentor-runtime.ts"), "utf8");
const extractor = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/memory-extractor.ts"), "utf8");
const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/personal-intelligence/mentor/route.ts"), "utf8");
const contextAudit = fs.readFileSync(path.join(process.cwd(), "src/lib/personal-intelligence/context-audit.ts"), "utf8");

test("mentor API is owner-only and requires explicit sensitive-context permission", () => {
  assert.match(route, /access\.role !== "OWNER"/);
  assert.match(route, /explicitSensitivePermission/);
  assert.match(route, /sensitive.*restricted[\s\S]*explicitSensitivePermission/s);
});

test("runtime validates subject ownership before service-role context retrieval", () => {
  assert.match(runtime, /\.eq\("id", input\.subjectEntityId\)/);
  assert.match(runtime, /\.eq\("owner_user_id", input\.ownerUserId\)/);
});

test("runtime logs approved context and exposes only source-level context summary", () => {
  assert.match(runtime, /logPersonalContextUsage/);
  assert.match(runtime, /claimsUsed/);
  assert.match(runtime, /goalsUsed/);
  assert.doesNotMatch(runtime, /chain.?of.?thought/i);
  assert.match(contextAudit, /mentor.*context_usage/s);
});

test("memory extraction is grounded only in the current user message and does not auto-write", () => {
  assert.match(runtime, /extractMemoryCandidates\(message\)/);
  assert.doesNotMatch(extractor, /\.from\("claims"\).*\.insert/s);
  assert.match(extractor, /Do not infer personality traits/);
  assert.match(extractor, /AUTO should be rare/);
});

test("Think Deeper changes analysis depth but not the privacy gate", () => {
  assert.match(runtime, /limit: input\.thinkDeeper \? 60 : 30/);
  assert.match(runtime, /model: input\.thinkDeeper \? "sonnet" : "haiku"/);
  assert.match(runtime, /sessionScope: privacyScope/);
  assert.match(runtime, /explicitSensitivePermission: input\.explicitSensitivePermission/);
});
