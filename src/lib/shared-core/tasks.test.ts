import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHARED_WORK_BOUNDARY_BY_ID,
  WORK_ITEM_ACTIVE_STATUSES,
  WORK_ITEM_SOURCE_TYPES,
  isActiveWorkItemStatus,
  isTerminalWorkItemStatus,
  normalizeExternalTaskStatus,
  normalizeWorkItemPriority,
  normalizeWorkItemSourceType,
  normalizeWorkItemStatus,
} from "@/lib/shared-core/tasks";

test("Shared Work exposes the exact canonical RealtyFlow task lifecycle", () => {
  assert.deepEqual(WORK_ITEM_ACTIVE_STATUSES, ["TO_DO", "IN_PROGRESS", "REVIEW"]);
  assert.equal(normalizeWorkItemStatus("TO_DO"), "TO_DO");
  assert.equal(normalizeWorkItemStatus("DONE"), "DONE");
  assert.equal(normalizeWorkItemStatus("CANCELLED"), "CANCELLED");
  assert.equal(isActiveWorkItemStatus("REVIEW"), true);
  assert.equal(isActiveWorkItemStatus("DONE"), false);
  assert.equal(isTerminalWorkItemStatus("CANCELLED"), true);
});

test("legacy and specialist aliases normalize at the boundary without entering the database contract", () => {
  assert.equal(normalizeWorkItemStatus("TODO"), "TO_DO");
  assert.equal(normalizeWorkItemStatus("OPEN"), "TO_DO");
  assert.equal(normalizeWorkItemStatus("PENDING"), "TO_DO");
  assert.equal(normalizeWorkItemStatus("COMPLETED"), "DONE");
  assert.equal(normalizeWorkItemStatus("CANCELED"), "CANCELLED");
  assert.equal(normalizeExternalTaskStatus("TODO"), "TO_DO");
});

test("priority and source normalization preserve the established work_items contract", () => {
  assert.equal(normalizeWorkItemPriority("high"), "HIGH");
  assert.equal(normalizeWorkItemPriority("invalid"), "MEDIUM");
  assert.equal(WORK_ITEM_SOURCE_TYPES.includes("kdp"), true);
  assert.equal(normalizeWorkItemSourceType("crm"), "crm");
  assert.equal(normalizeWorkItemSourceType("unknown"), "manual");
});

test("workspace and Olivia tasks stay source-owned while automation remains execution evidence", () => {
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.realtyflow.systemOfRecord, "public.work_items");
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.realtyflow.mirrorIntoWorkItems, true);
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.workspace_joint.mode, "isolated");
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.workspace_joint.mirrorIntoWorkItems, false);
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.olivia.systemOfRecord, "olivia.tasks");
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.olivia.mirrorIntoWorkItems, false);
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.automation.mode, "execution-evidence");
  assert.equal(SHARED_WORK_BOUNDARY_BY_ID.automation.mirrorIntoWorkItems, false);
});
