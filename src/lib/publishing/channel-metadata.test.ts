import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelMetadataPackages } from "./channel-metadata";

const taxonomy = [
  { id: "c1", assignment_type: "category" as const, scheme: "bisac", code: "FIC031000", label: "Thrillers", rank: 1, status: "approved" },
  { id: "a1", assignment_type: "category" as const, scheme: "amazon_category", code: "thrillers", label: "Political Thrillers", rank: 1, status: "approved" },
  ...Array.from({ length: 7 }, (_, index) => ({ id: `k${index}`, assignment_type: "keyword" as const, scheme: "internal_keyword", code: `key-${index}`, label: `keyword ${index}`, rank: index + 1, status: "approved" })),
];

test("maps one canonical source into four deterministic, unsent channel packages", () => {
  const packages = buildChannelMetadataPackages({ editionId: "e1", revisionId: "r1", title: "Book", author: "Author", language: "EN", description: "Description", taxonomy });
  assert.deepEqual(packages.map((item) => item.channel), ["amazon_kdp", "apple_books", "google_play_books", "kobo_writing_life"]);
  assert.equal(packages[0].payload.categories[0].scheme, "amazon_category");
  assert.equal(packages[1].payload.categories[0].scheme, "bisac");
  assert.equal(packages[0].payload.keywords.length, 7);
  assert.equal(packages.every((item) => item.payload.delivery.submitted === false), true);
  assert.equal(buildChannelMetadataPackages({ editionId: "e1", revisionId: "r1", title: "Book", author: "Author", language: "EN", description: "Description", taxonomy })[0].payloadFingerprint, packages[0].payloadFingerprint);
});

test("refuses incomplete approved taxonomy", () => {
  assert.throws(() => buildChannelMetadataPackages({ editionId: "e", revisionId: "r", title: "Book", author: "Author", language: "en", description: "Description", taxonomy: taxonomy.slice(0, 3) }), /5–7/);
});
