import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicationIngestDraft } from "./publication-ingest-draft";

test("builds a stable Book OS package draft", () => {
  const draft = buildPublicationIngestDraft({
    seriesKey: "Money & Power",
    bookKey: "The Debt Machine",
    title: "THE DEBT MACHINE",
    subtitle: "How Credit Creates Money, Fortunes, Crises and Power",
    seriesName: "Money & Power",
    seriesNumber: 2,
    language: "en",
    revisionNumber: 1,
  });
  assert.equal(draft.manifest.workKey, "money-power:the-debt-machine");
  assert.equal(draft.manifest.editionKey, "money-power:the-debt-machine:en:ebook");
  assert.equal(draft.manifest.ingestKey, "money-power:the-debt-machine:en:r1");
  assert.deepEqual(draft.manifest.assets, []);
  assert.equal(draft.manifest.packageFingerprint, "");
});

test("requires stable identity and title", () => {
  assert.throws(() => buildPublicationIngestDraft({ seriesKey: "", bookKey: "book", title: "Title" }), /seriesKey and bookKey/);
  assert.throws(() => buildPublicationIngestDraft({ seriesKey: "series", bookKey: "book", title: " " }), /title is required/);
});
