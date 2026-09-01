import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("sales evidence route is admin-only and reads canonical evidence", () => {
  assert.match(route, /requireAdminApi\(request\)/g);
  assert.match(route, /publishing_sales_facts/);
  assert.match(route, /publishing_sales_import_batches/);
  assert.match(route, /publishing_sales_reconciliation_exceptions/);
  assert.match(route, /publishing_sales_reconciliation_resolutions/);
  assert.match(route, /publishing_catalog_works/);
  assert.match(route, /publishing_catalog_editions/);
});

test("reconciliation is explicit and cannot publish or modify channels", () => {
  assert.match(route, /body\?\.action === "reconcile_legacy"/);
  assert.match(route, /publishing_reconcile_legacy_sales_metrics/);
  assert.match(route, /publishing_stage_sales_exception_resolution/);
  assert.match(route, /publishing_decide_sales_exception_resolution/);
  assert.match(route, /"approve","reject"/);
  assert.doesNotMatch(route, /runApprovedPublication/);
  assert.doesNotMatch(route, /marketing_publications/);
  assert.doesNotMatch(route, /content_publications/);
  assert.doesNotMatch(route, /publishing_distribution_publications/);
});
