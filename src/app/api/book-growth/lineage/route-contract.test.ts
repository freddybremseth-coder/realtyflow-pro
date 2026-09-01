import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/book-growth/lineage/route.ts"), "utf8");

test("lineage audit is admin-only and GET-only", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.match(route, /requireAdminApi\(request\)/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("lineage audit is strictly read-only", () => {
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.delete\(/);
  assert.doesNotMatch(route, /\.rpc\(/);
});

test("lineage resolves canonical project, edition and revision using exact ids", () => {
  assert.match(route, /canonical_project_id/);
  assert.match(route, /catalog_edition_id/);
  assert.match(route, /source_project_id/);
  assert.match(route, /\.eq\("is_canonical", true\)/);
  assert.match(route, /publishing_package_ingests/);
  assert.match(route, /publishing_distribution_publications/);
  assert.match(route, /publishing_sales_facts/);
  assert.match(route, /publishing_sales_experiments/);
  assert.match(route, /publishing_learning_proposals/);
});

test("lineage surfaces conflicts and incomplete provenance instead of hiding it", () => {
  assert.match(route, /const conflicts: string\[\]/);
  assert.match(route, /const missing: string\[\]/);
  assert.match(route, /lineageStatus: conflicts\.length \? "conflict" : missing\.length \? "incomplete" : "complete"/);
  assert.match(route, /readOnly: true/);
});
