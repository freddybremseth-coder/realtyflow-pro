import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("canonical catalogue API uses the deployed reconciliation schema", () => {
  assert.match(route, /source_work_id,target_work_id,candidate_type,confidence/);
  assert.doesNotMatch(route, /source_work_id,target_work_id,match_type/);
  assert.match(route, /groupReconciliationCandidates\(hydratedCandidates\)/);
  assert.match(route, /action === "scan_artifact_variants"/);
  assert.match(route, /ignoreDuplicates: true/);
});
