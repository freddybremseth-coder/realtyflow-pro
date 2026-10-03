import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("src/app/api/care/visits/route.ts", "utf8");

test("Care visit list and write actions stay behind Care permissions", () => {
  assert.match(route, /requireAdminApi\(request\)/);
  assert.match(route, /schema\("care"\)/);
  assert.match(route, /action === "schedule"/);
  assert.match(route, /action === "start"/);
});

test("Starting a Care visit snapshots the active checklist and links the calendar event", () => {
  assert.match(route, /kh_checklist_templates/);
  assert.match(route, /kh_checklist_items/);
  assert.match(route, /template_snapshot/);
  assert.match(route, /kh_inspection_items/);
  assert.match(route, /arrival\.checkin/);
  assert.match(route, /inspection_id: inspectionId/);
});

test("Care visit inspector is resolved from the authenticated RealtyFlow identity", () => {
  assert.match(route, /getRequestAccessContext/);
  assert.match(route, /supabase\.auth\.admin\.listUsers/);
  assert.match(route, /org_members/);
  assert.match(route, /role: "inspector"/);
});
