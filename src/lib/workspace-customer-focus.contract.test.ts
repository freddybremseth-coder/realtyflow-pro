import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspace = fs.readFileSync(
  path.join(process.cwd(), "src/app/(realty)/workspace/[brandKey]/page.tsx"),
  "utf8",
);
const tasks = fs.readFileSync(
  path.join(process.cwd(), "src/components/workspaces/zen-joint-tasks.tsx"),
  "utf8",
);

test("focused workspace customer binds Zen tasks to the opened customer", () => {
  assert.match(workspace, /selectedCustomerId/);
  assert.match(workspace, /selectedContactId=\{selectedCustomer\.id\}/);
  assert.match(workspace, /hideContactSelector/);
  assert.match(tasks, /selectedContactId\?: string/);
  assert.match(tasks, /hideContactSelector\?: boolean/);
});

test("focused workspace customer stays inside scoped workspace APIs", () => {
  assert.doesNotMatch(workspace, /fetch\(["']\/api\/customers/);
  assert.doesNotMatch(workspace, /fetch\(["']\/api\/revenue/);
  assert.match(tasks, /\/api\/workspaces\/zeneco\/joint-tasks/);
});

test("focused workspace customer does not expose finance or legacy note fields", () => {
  for (const forbidden of ["commission_amount", "pipeline_value", "contacts.notes"]) {
    assert.equal(workspace.includes(forbidden), false, forbidden);
  }
});
