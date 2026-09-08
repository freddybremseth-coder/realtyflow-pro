import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const routePath = resolve(process.cwd(), "src/app/api/nexus/stage-readiness/route.ts");
const source = readFileSync(routePath, "utf8");

test("Stage Readiness requires approved actionable matching criteria", () => {
  assert.match(source, /\.eq\("approval_status", "approved"\)/);
  assert.match(source, /otherKey === "routing_persona"/);
  assert.match(source, /actionableCriteria\.length === 0/);
  assert.match(source, /Routing Persona alene er ikke nok/);
});

test("Persona-only profiles cannot be treated as shortlist-ready", () => {
  assert.match(source, /const actionableCriteria = profileCriteria\.filter\(isActionableMatchingCriterion\)/);
  assert.match(source, /criteriaCount: actionableCriteria\.length/);
  assert.match(source, /totalApprovedCriteriaCount: profileCriteria\.length/);
});
