import assert from "node:assert/strict";
import test from "node:test";
import { artifactInput, bookProductionHandoffIdentity, bookProductionRetailerMetadata, handoffReadiness } from "./book-production-handoff";

test("uses stable Book Engine project identity instead of title", () => {
  const project = { id: "8B73A089-1111-2222-3333-ABCDEF012345", title: "A Title That Can Change", language: "en" };
  const identity = bookProductionHandoffIdentity(project, 2);
  assert.equal(identity.workKey, "book-engine:8b73a089-1111-2222-3333-abcdef012345");
  assert.equal(identity.editionKey, "book-engine:8b73a089-1111-2222-3333-abcdef012345:en:ebook");
  assert.equal(identity.ingestKey, "book-engine:8b73a089-1111-2222-3333-abcdef012345:en:r2");
});

test("requires publication-ready manuscript, cover and retailer metadata before handoff", () => {
  const ready = handoffReadiness({
    title: "Book",
    subtitle: "Subtitle",
    series_name: "Series",
    status: "ready_for_export",
    chapter_drafts: [{ draft: "Chapter" }],
    metadata_plan: { kdp: { description: "Description", keywords: ["one"], categories: ["Economics"] } },
  }, true);
  assert.equal(ready.ok, true);
  assert.equal(ready.productionStatus, "publication_ready_candidate");
  assert.equal(ready.blocking.length, 0);

  const blocked = handoffReadiness({ status: "generated", chapter_drafts: [] }, false);
  assert.equal(blocked.ok, false);
  assert.match(blocked.blocking.join(" "), /ready_for_export/);
  assert.match(blocked.blocking.join(" "), /chapters/);
  assert.match(blocked.blocking.join(" "), /cover/);
  assert.match(blocked.blocking.join(" "), /description/);
});

test("builds deterministic retailer metadata from project truth", () => {
  const text = bookProductionRetailerMetadata({
    id: "project-1",
    title: "Book",
    subtitle: "Subtitle",
    series_name: "Series",
    language: "en",
    metadata_plan: { author: "Freddy Bremseth", kdp: { description: "Description", keywords: ["one", "two"], categories: ["Economics"] } },
  }).toString("utf8");
  assert.match(text, /Title: Book/);
  assert.match(text, /Author: Freddy Bremseth/);
  assert.match(text, /Keywords: one; two/);
  assert.match(text, /Source Project ID: project-1/);
});

test("fingerprints generated assets and preserves revision", () => {
  const identity = bookProductionHandoffIdentity({ id: "project-1", language: "en" }, 3);
  const asset = artifactInput(identity, { assetType: "epub", role: "retailer_epub", filename: "book.epub", bytes: Buffer.from("book-os"), mimeType: "application/epub+zip" });
  assert.equal(asset.version, undefined);
  assert.equal(asset.revisionNumber, 3);
  assert.equal(asset.fingerprint, "a6910b19cd81b8a0711446528767ade0ceff83353b80789eb61fb07162775333");
});
