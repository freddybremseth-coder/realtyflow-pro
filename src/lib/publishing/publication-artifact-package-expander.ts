import JSZip from "jszip";
import {
  MAX_PUBLICATION_ASSET_BYTES,
  publicationArtifactStoragePath,
  sha256Buffer,
  type ArtifactUploadTicketInput,
} from "./publication-artifact-upload";

export const MAX_PUBLICATION_PACKAGE_ENTRIES = 50;
export const MAX_PUBLICATION_PACKAGE_EXPANDED_BYTES = 250 * 1024 * 1024;

export type PackageAssetClassification = {
  assetType: ArtifactUploadTicketInput["assetType"];
  role: string;
  canonical: boolean;
  mimeType: string;
};

export type ExpandedPublicationAsset = {
  input: ArtifactUploadTicketInput;
  storagePath: string;
  bytes: Uint8Array;
};

const REQUIRED_ROLES = new Set(["english_master", "retailer_epub", "ebook_cover", "print_interior", "retailer_metadata"]);

function basename(path: string) {
  return path.split("/").filter(Boolean).pop() || "";
}

function isUnsafeZipPath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  return normalized.startsWith("/") || normalized.split("/").some((part) => part === "..");
}

export function classifyPublicationPackageFilename(filename: string): PackageAssetClassification | null {
  const name = basename(filename);
  const lower = name.toLowerCase();

  if (/\.docx$/.test(lower) && /(master|manuscript)/.test(lower)) {
    return { assetType: "manuscript_docx", role: "english_master", canonical: true, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (/\.epub$/.test(lower)) {
    return { assetType: "epub", role: "retailer_epub", canonical: true, mimeType: "application/epub+zip" };
  }
  if (/ebook[_ -]?cover.*\.(jpg|jpeg|png|webp)$/.test(lower)) {
    const ext = lower.split(".").pop();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { assetType: "cover", role: "ebook_cover", canonical: true, mimeType };
  }
  if (/print[_ -]?interior.*\.pdf$/.test(lower)) {
    return { assetType: "pdf", role: "print_interior", canonical: true, mimeType: "application/pdf" };
  }
  if (/kdp[_ -]?full[_ -]?cover.*\.pdf$/.test(lower)) {
    return { assetType: "cover", role: "kdp_full_wrap", canonical: false, mimeType: "application/pdf" };
  }
  if (/reader[_ -]?sample.*\.pdf$/.test(lower)) {
    return { assetType: "sample", role: "reader_sample", canonical: true, mimeType: "application/pdf" };
  }
  if (/^retailer[_ -]?metadata\.txt$/.test(lower)) {
    return { assetType: "metadata", role: "retailer_metadata", canonical: true, mimeType: "text/plain" };
  }
  return null;
}

export async function expandPublicationPackage(
  packageBytes: ArrayBuffer | Uint8Array,
  identity: Pick<ArtifactUploadTicketInput, "workKey" | "editionKey" | "revisionNumber">,
): Promise<{ assets: ExpandedPublicationAsset[]; ignoredEntries: string[] }> {
  const zip = await JSZip.loadAsync(packageBytes);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith("__MACOSX/"));
  if (entries.length > MAX_PUBLICATION_PACKAGE_ENTRIES) {
    throw new Error(`Publication package contains too many entries (${entries.length}/${MAX_PUBLICATION_PACKAGE_ENTRIES})`);
  }

  const assets: ExpandedPublicationAsset[] = [];
  const ignoredEntries: string[] = [];
  const seenRoles = new Set<string>();
  let totalBytes = 0;

  for (const entry of entries) {
    if (isUnsafeZipPath(entry.name)) throw new Error(`Unsafe ZIP path: ${entry.name}`);
    const classification = classifyPublicationPackageFilename(entry.name);
    if (!classification) {
      ignoredEntries.push(entry.name);
      continue;
    }
    if (seenRoles.has(classification.role)) throw new Error(`Duplicate publication role in ZIP: ${classification.role}`);

    const bytes = await entry.async("uint8array");
    if (!bytes.byteLength || bytes.byteLength > MAX_PUBLICATION_ASSET_BYTES) {
      throw new Error(`Expanded asset is outside the 100 MB publication limit: ${entry.name}`);
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_PUBLICATION_PACKAGE_EXPANDED_BYTES) {
      throw new Error("Expanded publication package exceeds the 250 MB safety limit");
    }

    const fingerprint = sha256Buffer(bytes);
    const input: ArtifactUploadTicketInput = {
      workKey: identity.workKey,
      editionKey: identity.editionKey,
      revisionNumber: identity.revisionNumber,
      assetType: classification.assetType,
      role: classification.role,
      filename: basename(entry.name),
      fingerprint,
      size: bytes.byteLength,
      mimeType: classification.mimeType,
      canonical: classification.canonical,
    };
    assets.push({ input, storagePath: publicationArtifactStoragePath(input), bytes });
    seenRoles.add(classification.role);
  }

  const missing = [...REQUIRED_ROLES].filter((role) => !seenRoles.has(role));
  if (missing.length) throw new Error(`Publication package is missing required roles: ${missing.join(", ")}`);
  return { assets, ignoredEntries };
}
