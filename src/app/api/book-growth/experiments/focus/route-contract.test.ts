import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "src/app/api/book-growth/experiments/focus/route.ts"), "utf8");
const context = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/experiments-focus-context.tsx"), "utf8");
const page = fs.readFileSync(path.join(process.cwd(), "src/app/(content)/book-growth/experiments/page.tsx"), "utf8");
const salesContext = fs.readFileSync(path.join(process.cwd(), "src/components/book-growth/sales-evidence-focus-context.tsx"), "utf8");

test("experiment focus is admin-only and read-only", () => {
  assert.match(route, /requireAdminApi/);
  assert.match(route, /publishing_catalog_revisions/);
  assert.match(route, /publishing_sales_facts/);
  assert.match(route, /publishing_sales_experiments/);
  assert.doesNotMatch(route, /export async function POST/);
  assert.doesNotMatch(route, /\.insert\s*\(/);
  assert.doesNotMatch(route, /\.upsert\s*\(/);
  assert.doesNotMatch(route, /\.update\s*\(/);
  assert.doesNotMatch(route, /\.delete\s*\(/);
  assert.doesNotMatch(route, /\.rpc\s*\(/);
});

test("focus verifies requested revision against the canonical revision", () => {
  assert.match(route, /revisionMatches/);
  assert.match(route, /is_canonical/);
  assert.match(route, /exactRevisionFacts/);
  assert.match(route, /activeExperimentCount/);
});

test("Sales Evidence only carries context into Controlled Experiments", () => {
  assert.match(salesContext, /Open this evidence in Controlled Experiments/);
  assert.match(salesContext, /\/book-growth\/experiments\?editionId=/);
  assert.doesNotMatch(salesContext, /action:\s*"stage"/);
  assert.doesNotMatch(salesContext, /method:\s*"POST"/);
});

test("Controlled Experiments preselects edition but leaves proposal fields explicit", () => {
  assert.match(page, /focusedEditionId/);
  assert.match(page, /editionId:focusedEditionId/);
  assert.match(page, /hypothesis:""/);
  assert.match(page, /baselineValue:""/);
  assert.match(page, /proposedValue:""/);
  assert.match(page, /measurementStart:""/);
  assert.match(page, /measurementEnd:""/);
  assert.match(context, /You must still define one hypothesis/);
});
