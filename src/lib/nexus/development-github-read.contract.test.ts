import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("src/lib/nexus/development-github-read.ts", "utf8");
const route = fs.readFileSync("src/app/api/nexus/development-tasks/[taskId]/plan/route.ts", "utf8");

test("GitHub evidence is read only and scoped to approved repositories", () => {
  assert.match(source, /recognizedRepository\(fullName\)/);
  assert.match(source, /resolveDevelopmentRepository\("realtyflow"\)/);
  assert.match(source, /resolveDevelopmentRepository\("altovena"\)/);
  assert.match(source, /method: "GET"/);
  assert.doesNotMatch(source, /method: "POST"/);
  assert.match(source, /verified: false/);
  assert.match(source, /cache: "no-store"/);
});

test("plans never convert GitHub evidence into execution authorization", () => {
  assert.match(route, /readDevelopmentRepositoryEvidence\(plan.repository\)/);
  assert.match(route, /plan, githubEvidence/);
  assert.match(route, /ingen kode er endret/);
});
