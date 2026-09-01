import assert from "node:assert/strict";
import test from "node:test";
import { publicationPackageGateSummary, validatePublicationPackageManifest } from "./publication-package";

const fp = "a".repeat(64);

function validManifest() {
  return {
    ingestKey: "money-power:debt-machine:en:r1",
    workKey: "money-power:debt-machine",
    editionKey: "money-power:debt-machine:en:ebook",
    title: "THE DEBT MACHINE",
    subtitle: "How Credit Creates Money, Fortunes, Crises and Power",
    seriesName: "Money & Power",
    seriesNumber: 2,
    language: "en",
    format: "ebook",
    revisionNumber: 1,
    packageFingerprint: fp,
    assets: [
      { assetType: "manuscript_docx", storageBucket: "publishing-assets", storagePath: "money-power/debt-machine/r1/master.docx", fingerprint: fp, canonical: true, verified: true },
      { assetType: "epub", storageBucket: "publishing-assets", storagePath: "money-power/debt-machine/r1/book.epub", fingerprint: fp, canonical: true, verified: true },
      { assetType: "cover", role: "ebook_cover", storageBucket: "publishing-assets", storagePath: "money-power/debt-machine/r1/cover.jpg", fingerprint: fp, canonical: true, verified: true },
      { assetType: "pdf", role: "print_interior", storageBucket: "publishing-assets", storagePath: "money-power/debt-machine/r1/interior.pdf", fingerprint: fp, canonical: true, verified: true },
      { assetType: "package_zip", storageBucket: "publishing-assets", storagePath: "money-power/debt-machine/r1/package.zip", fingerprint: fp, canonical: true, verified: true },
    ],
  };
}

test("accepts a complete publication package manifest", () => {
  const result = validatePublicationPackageManifest(validManifest());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.manifest.seriesNumber, 2);
  assert.equal(result.manifest.assets.length, 5);
  const gates = publicationPackageGateSummary(result.manifest);
  assert.equal(gates.hasVerifiedCanonicalEpub, true);
  assert.equal(gates.hasVerifiedCanonicalCover, true);
  assert.equal(gates.autoApproved, false);
  assert.equal(gates.autoPublished, false);
  assert.equal(gates.nextGate, "quality_center");
});

test("rejects package assets without a durable location", () => {
  const manifest = validManifest();
  manifest.assets = [{ assetType: "epub", fingerprint: fp } as any];
  const result = validatePublicationPackageManifest(manifest);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors.join(" "), /storagePath or externalUrl/);
});

test("warns when launch-critical assets are absent", () => {
  const manifest = validManifest();
  manifest.assets = [{ assetType: "manuscript_docx", storagePath: "x/master.docx", fingerprint: fp } as any];
  const result = validatePublicationPackageManifest(manifest);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.match(result.warnings.join(" "), /EPUB/);
  assert.match(result.warnings.join(" "), /cover/);
});
