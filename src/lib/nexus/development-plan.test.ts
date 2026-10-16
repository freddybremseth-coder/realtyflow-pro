import assert from "node:assert/strict";
import test from "node:test";
import { createDevelopmentPlan } from "./development-plan";

test("plans are deterministic and never authorize execution", () => {
  const task = { id: "a", request_text: "Forbedre Altovena Visibility", brand_key: "altovena" };
  const first = createDevelopmentPlan(task);
  assert.deepEqual(first, createDevelopmentPlan(task));
  assert.equal(first.executionEnabled, false);
  assert.equal(first.requiresApproval, true);
  assert.equal(first.repository, "freddybremseth-coder/Altovena");
  assert.match(first.planHash, /^[0-9a-f]{64}$/);
});
