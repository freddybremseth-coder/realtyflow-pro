import JSZip from "jszip";
import { MAX_PUBLICATION_ASSET_BYTES, publicationArtifactStoragePath, sha256Buffer, type ArtifactUploadTicketInput } from "./publication-artifact-upload";
import { expandPublicationPackage } from "./publication-artifact-package-expander";
import { buildPublicationIngestDraft } from "./publication-ingest-draft";
import { publicationPackageGateSummary, validatePublicationPackageManifest, type PublicationPackageManifest } from "./publication-package";

export const MAX_PUBLICATION_BATCH_BOOKS = 20;
const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_KEY = /^[a-z0-9][a-z0-9._:-]{1,159}$/i;

export type SeriesBatchUploadInput = {
  batchKey: string;
  filename: string;
  fingerprint: string;
  size: number;
};

export type PreparedSeriesBatchBook = {
  manifest: PublicationPackageManifest;
  packageInput: ArtifactUploadTicketInput;
  packageStoragePath: string;
  packageBytes: Uint8Array;
  expandedAssets: Awaited<ReturnType<typeof expandPublicationPackage>>["assets"];
  ignoredEntries: string[];
  gates: ReturnType<typeof publicationPackageGateSummary>;
};

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function safeSegment(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}
function baseName(value: string) { return value.split(/[\\/]/).pop() || ""; }

export function validateSeriesBatchUploadInput(input: unknown): { ok: true; value: SeriesBatchUploadInput } | { ok: false; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["batch upload input must be an object"] };
  const body = input as Record<string, unknown>;
  const batchKey = clean(body.batchKey);
  const filename = baseName(clean(body.filename));
  const fingerprint = clean(body.fingerprint).toLowerCase();
  const size = Number(body.size);
  const errors: string[] = [];
  if (!SAFE_KEY.test(batchKey)) errors.push("batchKey has an invalid format");
  if (!filename.toLowerCase().endsWith(".zip")) errors.push("series batch must be a ZIP file");
  if (!SHA256.test(fingerprint)) errors.push("fingerprint must be sha256 hex");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PUBLICATION_ASSET_BYTES) errors.push("batch size is outside the 100 MB publication limit");
  return errors.length ? { ok: false, errors } : { ok: true, value: { batchKey, filename, fingerprint, size } };
}

export function seriesBatchStoragePath(input: SeriesBatchUploadInput) {
  const stem = safeSegment(input.filename.replace(/\.zip$/i, "")) || "series-batch";
  return `book-os-batches/${safeSegment(input.batchKey)}/${input.fingerprint.slice(0, 16)}-${stem}.zip`;
}

export async function prepareSeriesBatch(batchBytes: ArrayBuffer | Uint8Array): Promise<{ batchKey: string; seriesName: string; brandId: string; actor: string; books: PreparedSeriesBatchBook[] }> {
  const zip = await JSZip.loadAsync(batchBytes);
  const manifestEntry = zip.file("book-os-series-batch.json");
  if (!manifestEntry) throw new Error("Series batch is missing book-os-series-batch.json");
  const raw = JSON.parse(await manifestEntry.async("string"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Series batch manifest must be an object");
  const batchKey = clean(raw.batchKey);
  const seriesName = clean(raw.seriesName);
  const brandId = clean(raw.brandId) || "freddy_publishing";
  const actor = clean(raw.actor) || "series_batch_import";
  const books = Array.isArray(raw.books) ? raw.books : [];
  if (!batchKey || !seriesName) throw new Error("Series batch requires batchKey and seriesName");
  if (!books.length || books.length > MAX_PUBLICATION_BATCH_BOOKS) throw new Error(`Series batch must contain 1-${MAX_PUBLICATION_BATCH_BOOKS} books`);

  const prepared: PreparedSeriesBatchBook[] = [];
  const seenWorkKeys = new Set<string>();
  for (const [index, rawBook] of books.entries()) {
    if (!rawBook || typeof rawBook !== "object" || Array.isArray(rawBook)) throw new Error(`books[${index}] must be an object`);
    const book = rawBook as Record<string, unknown>;
    const filename = baseName(clean(book.filename));
    const declaredFingerprint = clean(book.packageFingerprint).toLowerCase();
    const declaredSize = Number(book.packageSize);
    if (!filename || !filename.toLowerCase().endsWith(".zip")) throw new Error(`books[${index}].filename must be a ZIP`);
    if (!SHA256.test(declaredFingerprint)) throw new Error(`books[${index}].packageFingerprint must be sha256 hex`);
    if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_PUBLICATION_ASSET_BYTES) throw new Error(`books[${index}].packageSize is invalid`);

    const childEntry = zip.file(`packages/${filename}`);
    if (!childEntry) throw new Error(`Missing child package: ${filename}`);
    const childBytes = await childEntry.async("uint8array");
    if (childBytes.byteLength !== declaredSize || sha256Buffer(childBytes) !== declaredFingerprint) throw new Error(`Child package checksum mismatch: ${filename}`);

    const draft = buildPublicationIngestDraft({
      seriesKey: clean(book.seriesKey),
      bookKey: clean(book.bookKey),
      title: clean(book.title),
      subtitle: clean(book.subtitle),
      seriesName: clean(book.seriesName) || seriesName,
      seriesNumber: Number(book.seriesNumber),
      language: clean(book.language) || "en",
      format: (clean(book.format) || "ebook") as "ebook",
      revisionNumber: Number(book.revisionNumber || 1),
    });
    if (seenWorkKeys.has(draft.manifest.workKey)) throw new Error(`Duplicate workKey in batch: ${draft.manifest.workKey}`);
    seenWorkKeys.add(draft.manifest.workKey);

    const packageInput: ArtifactUploadTicketInput = {
      workKey: draft.manifest.workKey,
      editionKey: draft.manifest.editionKey,
      revisionNumber: draft.manifest.revisionNumber,
      assetType: "package_zip",
      role: "complete_publication_package",
      filename,
      fingerprint: declaredFingerprint,
      size: childBytes.byteLength,
      mimeType: "application/zip",
      canonical: true,
    };
    const packageStoragePath = publicationArtifactStoragePath(packageInput);
    const expanded = await expandPublicationPackage(childBytes, packageInput);
    const assets = [
      {
        assetType: "package_zip" as const, role: packageInput.role, storageBucket: "publishing-assets", storagePath: packageStoragePath,
        fingerprint: packageInput.fingerprint, version: packageInput.revisionNumber, verified: true, canonical: true,
        metadata: { sourceFilename: filename, size: packageInput.size, mimeType: packageInput.mimeType, checksumVerified: true },
      },
      ...expanded.assets.map((item) => ({
        assetType: item.input.assetType as any, role: item.input.role, storageBucket: "publishing-assets", storagePath: item.storagePath,
        fingerprint: item.input.fingerprint, version: item.input.revisionNumber, verified: true, canonical: item.input.canonical,
        metadata: { sourceFilename: item.input.filename, size: item.input.size, mimeType: item.input.mimeType || null, checksumVerified: true },
      })),
    ];
    const master = assets.find((asset) => asset.assetType === "manuscript_docx");
    const candidate = {
      ...draft.manifest,
      brandId,
      packageFingerprint: declaredFingerprint,
      contentFingerprint: master?.fingerprint || "",
      productionStatus: clean(book.productionStatus) || clean(raw.productionStatus) || "production_ready",
      source: "series_batch_import",
      assets,
    };
    const validation = validatePublicationPackageManifest(candidate);
    if (!validation.ok) throw new Error(`Invalid book manifest for ${filename}: ${validation.errors.join("; ")}`);
    prepared.push({ manifest: validation.manifest, packageInput, packageStoragePath, packageBytes: childBytes, expandedAssets: expanded.assets, ignoredEntries: expanded.ignoredEntries, gates: publicationPackageGateSummary(validation.manifest) });
  }
  return { batchKey, seriesName, brandId, actor, books: prepared };
}
