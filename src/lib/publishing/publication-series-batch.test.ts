import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { sha256Buffer } from "./publication-artifact-upload";
import { prepareSeriesBatch, seriesBatchStoragePath, validateSeriesBatchUploadInput } from "./publication-series-batch";

async function childPackage(label: string) {
  const zip = new JSZip();
  zip.file(`${label}_English_Master_v1.0.docx`, "master");
  zip.file(`${label}_Freddy_Bremseth_v1.0.epub`, "epub");
  zip.file(`${label}_Ebook_Cover.jpg`, "cover");
  zip.file(`${label}_Print_Interior_6x9_100pp.pdf`, "interior");
  zip.file("Retailer_Metadata.txt", "metadata");
  return zip.generateAsync({ type: "uint8array" });
}

async function batch(override?: (manifest: any) => void) {
  const one = await childPackage("Book_One");
  const two = await childPackage("Book_Two");
  const manifest = {
    schemaVersion: 1,
    batchKey: "test-series:en:r1",
    seriesKey: "test-series",
    seriesName: "Test Series",
    brandId: "freddy_publishing",
    books: [
      { seriesNumber: 1, seriesKey: "test-series", bookKey: "book-one", title: "BOOK ONE", seriesName: "Test Series", language: "en", format: "ebook", revisionNumber: 1, filename: "book-one.zip", packageFingerprint: sha256Buffer(one), packageSize: one.byteLength },
      { seriesNumber: 2, seriesKey: "test-series", bookKey: "book-two", title: "BOOK TWO", seriesName: "Test Series", language: "en", format: "ebook", revisionNumber: 1, filename: "book-two.zip", packageFingerprint: sha256Buffer(two), packageSize: two.byteLength },
    ],
  };
  override?.(manifest);
  const zip = new JSZip();
  zip.file("book-os-series-batch.json", JSON.stringify(manifest));
  zip.file("packages/book-one.zip", one);
  zip.file("packages/book-two.zip", two);
  return zip.generateAsync({ type: "uint8array" });
}

test("validates immutable series batch upload identity", () => {
  const fp = "a".repeat(64);
  const result = validateSeriesBatchUploadInput({ batchKey: "money-power:en:r1", filename: "Money_and_Power.zip", fingerprint: fp, size: 1000 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(seriesBatchStoragePath(result.value), /^book-os-batches\/money-power-en-r1\//);
});

test("prepares child publication packages without ingesting", async () => {
  const result = await prepareSeriesBatch(await batch());
  assert.equal(result.books.length, 2);
  assert.equal(result.books[0].manifest.workKey, "test-series:book-one");
  assert.equal(result.books[1].manifest.editionKey, "test-series:book-two:en:ebook");
  assert.ok(result.books.every((book) => book.gates.autoApproved === false && book.gates.autoPublished === false));
  assert.ok(result.books.every((book) => book.manifest.assets.some((asset) => asset.assetType === "package_zip")));
});

test("rejects a child package checksum mismatch", async () => {
  const bytes = await batch((manifest) => { manifest.books[0].packageFingerprint = "b".repeat(64); });
  await assert.rejects(() => prepareSeriesBatch(bytes), /checksum mismatch/);
});

test("rejects duplicate works in a series batch", async () => {
  const bytes = await batch((manifest) => { manifest.books[1].bookKey = "book-one"; });
  await assert.rejects(() => prepareSeriesBatch(bytes), /Duplicate workKey/);
});
