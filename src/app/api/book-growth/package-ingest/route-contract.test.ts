import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/book-growth/package-ingest/route.ts"),
  "utf8",
);

test("package ingest route is admin-only and supports preview", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /action === "preview"/);
  assert.match(source, /validatePublicationPackageManifest/);
});

test("package ingest delegates mutation to the controlled database function", () => {
  assert.match(source, /publishing_ingest_publication_package/);
  assert.match(source, /p_manifest/);
  assert.match(source, /p_actor/);
});

test("package ingest does not bypass downstream approvals", () => {
  assert.match(source, /next: "\/book-growth\/quality-center"/);
  assert.match(source, /autoApproved: false/);
  assert.match(source, /autoPublished: false/);
  assert.doesNotMatch(source, /publishing_decide_launch_campaign/);
  assert.doesNotMatch(source, /publishing_decide_launch_release_candidate/);
});
