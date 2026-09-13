import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync("src/app/api/nexus/next-best-action/feedback/route.ts", "utf8");

test("execution feedback remains admin-authenticated and evidence-linked", () => {
  assert.match(source, /requireAdminApi\(request\)/);
  assert.match(source, /automation_recommended/);
  assert.match(source, /nexus_revenue_brain/);
  assert.match(source, /recordRevenueBrainExecution\(supabase, recommendation\)/);
});

test("execution feedback does not execute the recommended side effect", () => {
  assert.doesNotMatch(source, /sendEmail|publish|pipeline_status|update\(/);
});
