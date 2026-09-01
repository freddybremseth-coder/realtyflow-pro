import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("controlled experiments are admin-only and canonically scoped", () => {
  assert.match(route, /requireAdminApi\(request\)/g);
  assert.match(route, /publishing_sales_experiments/);
  assert.match(route, /publishing_catalog_editions/);
  assert.match(route, /publishing_stage_sales_experiment/);
});

test("approval, recorded application and evaluation remain separate", () => {
  assert.match(route, /publishing_decide_sales_experiment/);
  assert.match(route, /publishing_start_sales_experiment/);
  assert.match(route, /publishing_evaluate_sales_experiment/);
  assert.doesNotMatch(route, /runApprovedPublication/);
  assert.doesNotMatch(route, /marketing_publications/);
  assert.doesNotMatch(route, /content_publications/);
  assert.doesNotMatch(route, /publishing_distribution_publications/);
});
