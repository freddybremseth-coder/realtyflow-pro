import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const route = fs.readFileSync("src/app/api/nexus/next-best-action/route.ts", "utf8");
const helper = fs.readFileSync("src/lib/nexus/next-best-action-communication.ts", "utf8");

test("next-best-action communication advice remains recommendation-only", () => {
  assert.match(route, /recommendationOnly:\s*true/);
  assert.match(route, /automaticSending:\s*false/);
  assert.match(route, /policyRegistryStillAuthoritative:\s*true/);
  assert.match(route, /communicationLearningCanChangePolicy:\s*false/);
  assert.doesNotMatch(route, /sendBrandEmail/);
  assert.doesNotMatch(route, /sendEmail\s*\(/);
  assert.doesNotMatch(route, /\.update\s*\(/);
  assert.doesNotMatch(route, /\.insert\s*\(/);
});

test("learning helper cannot alter action policy or execution permission", () => {
  assert.match(helper, /\.\.\.action/);
  assert.match(helper, /recommendationOnly:\s*true/);
  assert.match(helper, /policyCanBeChanged:\s*false/);
  assert.match(helper, /customerSendEnabled:\s*false/);
  assert.doesNotMatch(helper, /automaticExecutionAllowed:\s*true/);
});
