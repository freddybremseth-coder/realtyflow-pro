import assert from "node:assert/strict";
import { test } from "node:test";
import { planVisibilityWorkItem, visibilityWorkDisplayState } from "./visibility-work-queue";
import type { VisibilityFinding } from "@/lib/visibility-product";

const finding: VisibilityFinding = {
  id: "visibility:donaanna:HEADING_STRUCTURE:https://donaanna.com/", brandId: "donaanna", title: "Missing H1",
  category: "technical", detail: "H1 missing in SSR HTML", nextStep: "Inspect source",
  priority: "high", url: "https://donaanna.com/",
  updatedAt: "2026-10-15T08:00:00Z", evidenceAge: "RECENT",
};
test("Visibility findings produce deterministic, non-executing work plans", () => {
  const a = planVisibilityWorkItem(finding);
  const b = planVisibilityWorkItem(finding);
  assert.deepEqual(a, b);
  assert.match(a.source_id, /^visibility:donaanna:[a-f0-9]{40}$/);
  assert.equal(a.metadata.publication_authorized, false);
  assert.equal(a.metadata.verification_required, true);
  assert.equal(a.metadata.execution_state, "PROPOSED");
});
test("Unknown identity cannot be placed in work queue", () => {
  assert.throws(() => planVisibilityWorkItem({...finding, brandId: "../other"}));
});
test("A closed task is not a verified outcome without evidence", () => {
  assert.equal(visibilityWorkDisplayState("DONE", {}), "PROPOSED");
  assert.equal(visibilityWorkDisplayState("DONE", {execution_state:"VERIFIED"}), "VERIFIED");
  assert.equal(visibilityWorkDisplayState("TO_DO", {execution_state:"BLOCKED"}), "BLOCKED");
});
