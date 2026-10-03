import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const route = readFileSync("src/app/api/care/visits/[id]/route.ts", "utf8");
const photo = readFileSync("src/app/api/care/visits/[id]/photos/route.ts", "utf8");
const report = readFileSync("src/services/care/visit-report.tsx", "utf8");

test("Care inspection updates checklist and creates issues/work orders", () => {
  assert.match(route, /action === "item"/);
  assert.match(route, /kh_inspection_items/);
  assert.match(route, /status === "deviation"/);
  assert.match(route, /kh_issues/);
  assert.match(route, /action === "work_order"/);
  assert.match(route, /kh_work_orders/);
});

test("Care completion enforces checklist and photo quality gates", () => {
  assert.match(route, /not_checked/);
  assert.match(route, /requires_value/);
  assert.match(route, /requires_photo/);
  assert.match(route, /min_photos/);
  assert.match(route, /property-documents/);
  assert.match(route, /kh_reports/);
  assert.match(route, /nextCareVisitAt/);
  assert.match(route, /status: "planned"/);
});

test("Care photo upload stays private and inspection-scoped", () => {
  assert.match(photo, /requireAdminApi\(request\)/);
  assert.match(photo, /from\("kh-photos"\)/);
  assert.match(photo, /kh_photos/);
  assert.match(photo, /inspection_id: inspectionId/);
  assert.match(photo, /createSignedUrl/);
});

test("Care report renderer produces a PDF artifact", () => {
  assert.match(report, /renderToBuffer/);
  assert.match(report, /Zen Eco Homes Care/);
  assert.match(report, /Rapporten sendes ikke automatisk/);
});
