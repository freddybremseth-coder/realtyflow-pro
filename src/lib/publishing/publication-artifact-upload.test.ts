import assert from "node:assert/strict";
import test from "node:test";
import {
  PUBLICATION_ASSET_BUCKET,
  publicationArtifactStoragePath,
  sha256Buffer,
  validateArtifactUploadTicketInput,
  verifiedManifestAsset,
} from "./publication-artifact-upload";

const fingerprint = "a".repeat(64);

function input() {
  return {
    workKey: "money-power:debt-machine",
    editionKey: "money-power:debt-machine:en:ebook",
    revisionNumber: 1,
    assetType: "epub",
    role: "retailer_epub",
    filename: "The Debt Machine.epub",
    fingerprint,
    size: 1024,
    mimeType: "application/epub+zip",
    canonical: true,
  };
}

test("builds an immutable publication storage path from canonical identity and checksum", () => {
  const result = validateArtifactUploadTicketInput(input());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const path = publicationArtifactStoragePath(result.value);
  assert.match(path, /^book-os\/money-power-debt-machine\/money-power-debt-machine-en-ebook\/r1\/epub\/aaaaaaaaaaaaaaaa-retailer_epub-the-debt-machine\.epub$/);
});

test("rejects traversal, unsupported files and oversized assets", () => {
  const bad = { ...input(), workKey: "../../secret", filename: "evil.exe", size: 101 * 1024 * 1024 };
  const result = validateArtifactUploadTicketInput(bad);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /workKey/);
  assert.match(result.errors.join(" "), /extension/);
  assert.match(result.errors.join(" "), /100 MB/);
});

test("verified manifest assets preserve noncanonical secondary covers", () => {
  const result = validateArtifactUploadTicketInput({ ...input(), assetType: "cover", role: "kdp_full_wrap", filename: "wrap.pdf", canonical: false });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const asset = verifiedManifestAsset(result.value, "book-os/test/wrap.pdf");
  assert.equal(asset.storageBucket, PUBLICATION_ASSET_BUCKET);
  assert.equal(asset.verified, true);
  assert.equal(asset.canonical, false);
});

test("sha256Buffer returns stable sha256", () => {
  assert.equal(sha256Buffer(new TextEncoder().encode("book-os")), "66f84cfdc7849268ec37194bf199ea97f69c3e3d3cb72226347bd3ad86d157e0");
});
