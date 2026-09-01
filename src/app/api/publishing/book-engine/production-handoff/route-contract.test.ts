import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/publishing/book-engine/production-handoff/route.ts"), "utf8");

test("production handoff is admin-only and requires ready project", () => {
  assert.match(source, /requireAdminApi/);
  assert.match(source, /handoffReadiness/);
  assert.match(source, /ready_for_export|not ready for production handoff/);
});

test("production handoff stores verified immutable artifacts", () => {
  assert.match(source, /PUBLICATION_ASSET_BUCKET/);
  assert.match(source, /publicationArtifactStoragePath/);
  assert.match(source, /sha256Buffer/);
  assert.match(source, /digital_publication_package/);
  assert.match(source, /productionStatus: "digital_ready"/);
});

test("production handoff never auto-ingests, approves or publishes", () => {
  assert.match(source, /ingested: false/);
  assert.doesNotMatch(source, /publishing_ingest_publication_package/);
  assert.doesNotMatch(source, /publishing_decide_launch_campaign/);
  assert.doesNotMatch(source, /publishing_decide_launch_release_candidate/);
  assert.doesNotMatch(source, /amazon_kdp.*published/);
});

test("production handoff is explicit about missing print artifacts", () => {
  assert.match(source, /Print interior PDF: NOT GENERATED/);
  assert.match(source, /KDP full-wrap: NOT GENERATED/);
  assert.match(source, /Add verified print interior and KDP full-wrap before declaring publication_ready/);
});
