import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/book-growth/distribution/focus/route.ts"),
  "utf8",
);

const launchContext = fs.readFileSync(
  path.join(process.cwd(), "src/components/book-growth/launch-factory-focus-context.tsx"),
  "utf8",
);

test("Distribution focus is admin-only, read-only and resolves canonical project", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /canonical_project_id/);
  assert.match(source, /catalog_edition_id/);
  assert.match(source, /isDistributionReady/);
  assert.match(source, /publicationApproval/);
  assert.doesNotMatch(source, /export async function POST/);
  assert.doesNotMatch(source, /publishing_distribution_jobs/);
  assert.doesNotMatch(source, /publishing_distribution_publications.*(?:insert|upsert|update)/s);
});

test("Launch context exposes Distribution only for an approved release", () => {
  assert.match(launchContext, /release\.status === "approved"/);
  assert.match(launchContext, /distributionHref/);
  assert.match(launchContext, /Open this release in Distribution/);
  assert.doesNotMatch(launchContext, /method:\s*"POST"/);
});
