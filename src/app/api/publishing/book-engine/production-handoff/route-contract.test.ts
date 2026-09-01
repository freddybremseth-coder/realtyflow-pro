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

test("production handoff stores verified immutable publication artifacts", () => {
  assert.match(source, /PUBLICATION_ASSET_BUCKET/);
  assert.match(source, /publicationArtifactStoragePath/);
  assert.match(source, /sha256Buffer/);
  assert.match(source, /complete_publication_package/);
  assert.match(source, /productionStatus: "publication_ready"/);
  assert.match(source, /role: "print_interior"/);
  assert.match(source, /role: "kdp_full_wrap"/);
});

test("production handoff renders print from the actual locked revision", () => {
  assert.match(source, /renderBookPrintInterior/);
  assert.match(source, /renderKdpFullWrap/);
  assert.match(source, /pageCount: printInterior\.pageCount/);
  assert.match(source, /Spine width/);
  assert.match(source, /Trim: 6x9 inches/);
});

test("production handoff never auto-ingests, approves or publishes", () => {
  assert.match(source, /ingested: false/);
  assert.doesNotMatch(source, /publishing_ingest_publication_package/);
  assert.doesNotMatch(source, /publishing_decide_launch_campaign/);
  assert.doesNotMatch(source, /publishing_decide_launch_release_candidate/);
  assert.doesNotMatch(source, /amazon_kdp.*published/);
});

test("publication-ready still routes through Quality Center", () => {
  assert.match(source, /Quality Center remains mandatory/);
  assert.match(source, /Preview and ingest the publication-ready manifest into review/);
});
