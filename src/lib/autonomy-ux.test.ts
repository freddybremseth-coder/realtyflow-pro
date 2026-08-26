import assert from "node:assert/strict";
import { test } from "node:test";
import { autonomyModeSummary, autonomyStages } from "@/lib/autonomy-ux";

test("approval mode stops before execution", () => {
  const stages = autonomyStages("approval");
  assert.equal(stages.find((stage) => stage.id === "suggest")?.enabled, true);
  assert.equal(stages.find((stage) => stage.id === "prepare")?.enabled, true);
  assert.equal(stages.find((stage) => stage.id === "approval")?.enabled, true);
  assert.equal(stages.find((stage) => stage.id === "execute")?.enabled, false);
  assert.equal(stages.find((stage) => stage.id === "auto")?.enabled, false);
});

test("guarded auto permits execution but not unrestricted auto", () => {
  const stages = autonomyStages("guarded_auto");
  assert.equal(stages.find((stage) => stage.id === "execute")?.enabled, true);
  assert.equal(stages.find((stage) => stage.id === "auto")?.enabled, false);
});

test("blocked mode only allows suggestion", () => {
  const enabled = autonomyStages("blocked").filter((stage) => stage.enabled).map((stage) => stage.id);
  assert.deepEqual(enabled, ["suggest"]);
  assert.match(autonomyModeSummary("blocked"), /blokkert/i);
});
