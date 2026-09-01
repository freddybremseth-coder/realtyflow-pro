import { createHash } from "node:crypto";

export const PUBLICATION_ASSET_BUCKET = "publishing-assets";
export const MAX_PUBLICATION_ASSET_BYTES = 100 * 1024 * 1024;

const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_KEY = /^[a-z0-9][a-z0-9._:-]{1,159}$/i;
const SAFE_EXTENSIONS = new Set([
  "docx", "epub", "pdf", "jpg", "jpeg", "png", "webp", "txt", "csv", "json", "zip",
]);
const ALLOWED_ASSET_TYPES = new Set([
  "source", "manuscript_docx", "epub", "pdf", "cover", "sample", "metadata", "package_zip",
]);

export type ArtifactUploadTicketInput = {
  workKey: string;
  editionKey: string;
  revisionNumber: number;
  assetType: string;
  role: string;
  filename: string;
  fingerprint: string;
  size: number;
  mimeType?: string;
  canonical: boolean;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function safeFilename(value: string) {
  const name = value.split(/[\\/]/).pop() || "artifact.bin";
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!SAFE_EXTENSIONS.has(extension)) return null;
  const stem = safeSegment(dot >= 0 ? name.slice(0, dot) : name) || "artifact";
  return `${stem}.${extension}`;
}

export function validateArtifactUploadTicketInput(input: unknown):
  | { ok: true; value: ArtifactUploadTicketInput }
  | { ok: false; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["upload ticket input must be an object"] };
  }
  const body = input as Record<string, unknown>;
  const errors: string[] = [];
  const workKey = clean(body.workKey);
  const editionKey = clean(body.editionKey);
  const assetType = clean(body.assetType);
  const role = clean(body.role) || assetType;
  const filename = clean(body.filename);
  const fingerprint = clean(body.fingerprint).toLowerCase();
  const size = Number(body.size);
  const revisionNumber = Math.trunc(Number(body.revisionNumber || 1));
  const mimeType = clean(body.mimeType) || undefined;
  const canonical = body.canonical !== false;

  if (!SAFE_KEY.test(workKey)) errors.push("workKey has an invalid format");
  if (!SAFE_KEY.test(editionKey)) errors.push("editionKey has an invalid format");
  if (!ALLOWED_ASSET_TYPES.has(assetType)) errors.push("assetType is unsupported");
  if (!role || role.length > 120) errors.push("role is invalid");
  if (!SHA256.test(fingerprint)) errors.push("fingerprint must be sha256 hex");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PUBLICATION_ASSET_BYTES) errors.push("file size is outside the 100 MB publication limit");
  if (!Number.isInteger(revisionNumber) || revisionNumber < 1) errors.push("revisionNumber must be positive");
  if (!safeFilename(filename)) errors.push("filename extension is unsupported");

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { workKey, editionKey, revisionNumber, assetType, role, filename, fingerprint, size, mimeType, canonical } };
}

export function publicationArtifactStoragePath(input: ArtifactUploadTicketInput) {
  const file = safeFilename(input.filename);
  if (!file) throw new Error("Unsupported publication filename");
  return [
    "book-os",
    safeSegment(input.workKey),
    safeSegment(input.editionKey),
    `r${input.revisionNumber}`,
    safeSegment(input.assetType),
    `${input.fingerprint.slice(0, 16)}-${safeSegment(input.role)}-${file}`,
  ].join("/");
}

export function sha256Buffer(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifiedManifestAsset(input: ArtifactUploadTicketInput, storagePath: string) {
  return {
    assetType: input.assetType,
    role: input.role,
    storageBucket: PUBLICATION_ASSET_BUCKET,
    storagePath,
    fingerprint: input.fingerprint,
    version: input.revisionNumber,
    verified: true,
    canonical: input.canonical,
    metadata: {
      sourceFilename: input.filename,
      size: input.size,
      mimeType: input.mimeType || null,
      checksumVerified: true,
    },
  };
}
