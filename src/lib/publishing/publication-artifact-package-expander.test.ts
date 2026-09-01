import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { classifyPublicationPackageFilename, expandPublicationPackage } from "./publication-artifact-package-expander";

const identity = {
  workKey: "money-power:price-of-money",
  editionKey: "money-power:price-of-money:en:ebook",
  revisionNumber: 1,
};

test("classifies canonical publication package filenames", () => {
  assert.deepEqual(classifyPublicationPackageFilename("Book_English_Master_v1.0.docx")?.role, "english_master");
  assert.deepEqual(classifyPublicationPackageFilename("Book_Freddy_Bremseth_v1.0.epub")?.role, "retailer_epub");
  assert.deepEqual(classifyPublicationPackageFilename("Book_Ebook_Cover.jpg")?.role, "ebook_cover");
  assert.deepEqual(classifyPublicationPackageFilename("Book_Print_Interior_6x9_166pp.pdf")?.role, "print_interior");
  assert.equal(classifyPublicationPackageFilename("Book_KDP_Full_Cover_6x9_166pp.pdf")?.canonical, false);
  assert.deepEqual(classifyPublicationPackageFilename("Book_Reader_Sample_v1.0.pdf")?.role, "reader_sample");
  assert.deepEqual(classifyPublicationPackageFilename("Retailer_Metadata.txt")?.role, "retailer_metadata");
  assert.equal(classifyPublicationPackageFilename("Publication_Validation_Report.txt"), null);
});

test("expands a complete package into immutable verified inputs", async () => {
  const zip = new JSZip();
  zip.file("Book_English_Master_v1.0.docx", "master");
  zip.file("Book_Freddy_Bremseth_v1.0.epub", "epub");
  zip.file("Book_Ebook_Cover.jpg", "cover");
  zip.file("Book_Print_Interior_6x9_166pp.pdf", "interior");
  zip.file("Book_KDP_Full_Cover_6x9_166pp.pdf", "wrap");
  zip.file("Book_Reader_Sample_v1.0.pdf", "sample");
  zip.file("Retailer_Metadata.txt", "metadata");
  zip.file("Publication_Validation_Report.txt", "ignored");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const result = await expandPublicationPackage(bytes, identity);

  assert.equal(result.assets.length, 7);
  assert.deepEqual(result.ignoredEntries, ["Publication_Validation_Report.txt"]);
  assert.ok(result.assets.every((asset) => asset.storagePath.startsWith("book-os/money-power-price-of-money/money-power-price-of-money-en-ebook/r1/")));
  assert.equal(result.assets.find((asset) => asset.input.role === "kdp_full_wrap")?.input.canonical, false);
});

test("rejects incomplete packages", async () => {
  const zip = new JSZip();
  zip.file("Book_Freddy_Bremseth_v1.0.epub", "epub");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(() => expandPublicationPackage(bytes, identity), /missing required roles/);
});

test("rejects duplicate publication roles", async () => {
  const zip = new JSZip();
  zip.file("A_English_Master_v1.0.docx", "a");
  zip.file("B_English_Master_v1.0.docx", "b");
  zip.file("Book_Freddy_Bremseth_v1.0.epub", "epub");
  zip.file("Book_Ebook_Cover.jpg", "cover");
  zip.file("Book_Print_Interior_6x9_166pp.pdf", "interior");
  zip.file("Retailer_Metadata.txt", "metadata");
  const bytes = await zip.generateAsync({ type: "uint8array" });
  await assert.rejects(() => expandPublicationPackage(bytes, identity), /Duplicate publication role/);
});
