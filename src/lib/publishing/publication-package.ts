export type PublicationPackageAssetType =
  | "source"
  | "manuscript_docx"
  | "epub"
  | "pdf"
  | "cover"
  | "sample"
  | "metadata"
  | "package_zip";

export type PublicationPackageAsset = {
  assetType: PublicationPackageAssetType;
  role?: string;
  storageBucket?: string;
  storagePath?: string;
  externalUrl?: string;
  fingerprint?: string;
  version?: number;
  verified?: boolean;
  canonical?: boolean;
  metadata?: Record<string, unknown>;
};

export type PublicationPackageManifest = {
  ingestKey: string;
  workKey: string;
  editionKey: string;
  title: string;
  subtitle?: string;
  seriesName?: string;
  seriesNumber?: number;
  language?: string;
  format?: "ebook" | "paperback" | "hardcover" | "audio" | "other";
  brandId?: string;
  revisionNumber?: number;
  packageFingerprint: string;
  contentFingerprint?: string;
  productionStatus?: string;
  source?: string;
  assets: PublicationPackageAsset[];
};

const SHA256 = /^[0-9a-f]{64}$/i;
const ASSET_TYPES = new Set<PublicationPackageAssetType>([
  "source","manuscript_docx","epub","pdf","cover","sample","metadata","package_zip",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validatePublicationPackageManifest(input: unknown):
  | { ok: true; manifest: PublicationPackageManifest; warnings: string[] }
  | { ok: false; errors: string[] } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  const body = input as Record<string, unknown>;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const key of ["ingestKey","workKey","editionKey","title","packageFingerprint"] as const) {
    if (!clean(body[key])) errors.push(`${key} is required`);
  }
  if (clean(body.packageFingerprint) && !SHA256.test(clean(body.packageFingerprint))) {
    errors.push("packageFingerprint must be a sha256 hex string");
  }
  const assets = Array.isArray(body.assets) ? body.assets : [];
  if (!assets.length) errors.push("assets must contain at least one item");
  const normalizedAssets: PublicationPackageAsset[] = [];
  for (const [index, raw] of assets.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`assets[${index}] must be an object`);
      continue;
    }
    const asset = raw as Record<string, unknown>;
    const assetType = clean(asset.assetType) as PublicationPackageAssetType;
    if (!ASSET_TYPES.has(assetType)) errors.push(`assets[${index}].assetType is unsupported`);
    const storagePath = clean(asset.storagePath) || undefined;
    const externalUrl = clean(asset.externalUrl) || undefined;
    if (!storagePath && !externalUrl) errors.push(`assets[${index}] requires storagePath or externalUrl`);
    const fingerprint = clean(asset.fingerprint) || undefined;
    if (fingerprint && !SHA256.test(fingerprint)) errors.push(`assets[${index}].fingerprint must be sha256 hex`);
    normalizedAssets.push({
      assetType,
      role: clean(asset.role) || undefined,
      storageBucket: clean(asset.storageBucket) || undefined,
      storagePath,
      externalUrl,
      fingerprint,
      version: typeof asset.version === "number" && Number.isFinite(asset.version) ? Math.max(1, Math.trunc(asset.version)) : 1,
      verified: asset.verified === true,
      canonical: asset.canonical === true,
      metadata: asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Record<string, unknown> : undefined,
    });
  }
  if (!normalizedAssets.some((asset) => asset.assetType === "epub")) warnings.push("No EPUB asset supplied; Launch Factory will remain blocked.");
  if (!normalizedAssets.some((asset) => asset.assetType === "cover")) warnings.push("No cover asset supplied; Launch Factory will remain blocked.");
  if (!normalizedAssets.some((asset) => asset.assetType === "metadata")) warnings.push("No metadata asset supplied; channel metadata will need to be generated later.");
  if (errors.length) return { ok: false, errors };
  const format = clean(body.format) || "ebook";
  if (!["ebook","paperback","hardcover","audio","other"].includes(format)) return { ok: false, errors: ["format is unsupported"] };
  return {
    ok: true,
    warnings,
    manifest: {
      ingestKey: clean(body.ingestKey),
      workKey: clean(body.workKey),
      editionKey: clean(body.editionKey),
      title: clean(body.title),
      subtitle: clean(body.subtitle) || undefined,
      seriesName: clean(body.seriesName) || undefined,
      seriesNumber: typeof body.seriesNumber === "number" ? Math.trunc(body.seriesNumber) : undefined,
      language: clean(body.language) || "en",
      format: format as PublicationPackageManifest["format"],
      brandId: clean(body.brandId) || "freddy_publishing",
      revisionNumber: typeof body.revisionNumber === "number" ? Math.max(1, Math.trunc(body.revisionNumber)) : 1,
      packageFingerprint: clean(body.packageFingerprint).toLowerCase(),
      contentFingerprint: clean(body.contentFingerprint).toLowerCase() || undefined,
      productionStatus: clean(body.productionStatus) || "production_ready",
      source: clean(body.source) || "book_os_package_ingest",
      assets: normalizedAssets,
    },
  };
}

export function publicationPackageGateSummary(manifest: PublicationPackageManifest) {
  const verifiedCanonical = (type: PublicationPackageAssetType) => manifest.assets.some((asset) => asset.assetType === type && asset.verified && asset.canonical);
  return {
    hasVerifiedCanonicalEpub: verifiedCanonical("epub"),
    hasVerifiedCanonicalCover: verifiedCanonical("cover"),
    hasCanonicalManuscript: manifest.assets.some((asset) => asset.assetType === "manuscript_docx" && asset.canonical),
    hasPackageZip: manifest.assets.some((asset) => asset.assetType === "package_zip"),
    nextGate: "quality_center" as const,
    autoApproved: false,
    autoPublished: false,
  };
}
