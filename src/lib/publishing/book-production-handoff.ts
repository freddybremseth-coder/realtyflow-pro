import { createHash } from "node:crypto";
import type { ArtifactUploadTicketInput } from "./publication-artifact-upload";
import { productionHandoffPreflight } from "./book-production-handoff-preflight";

export type BookProductionHandoffIdentity = {
  workKey: string;
  editionKey: string;
  ingestKey: string;
  revisionNumber: number;
  language: string;
  format: "ebook";
};

function clean(value: unknown) { return String(value || "").trim(); }
function safe(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

export function bookProductionHandoffIdentity(project: Record<string, any>, revisionNumber = 1): BookProductionHandoffIdentity {
  const id = clean(project.id);
  if (!id) throw new Error("Book project id is required");
  const stableId = safe(id);
  const language = safe(clean(project.language) || "en") || "en";
  const revision = Math.max(1, Math.trunc(Number(revisionNumber || 1)));
  const workKey = `book-engine:${stableId}`;
  return {
    workKey,
    editionKey: `${workKey}:${language}:ebook`,
    ingestKey: `${workKey}:${language}:r${revision}`,
    revisionNumber: revision,
    language,
    format: "ebook",
  };
}

export function bookProductionRetailerMetadata(project: Record<string, any>) {
  const metadata = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const kdp = metadata.kdp && typeof metadata.kdp === "object" ? metadata.kdp : metadata;
  const keywords = Array.isArray(kdp.keywords) ? kdp.keywords.map(String).filter(Boolean) : [];
  const categories = Array.isArray(kdp.categories) ? kdp.categories.map(String).filter(Boolean) : [];
  const lines = [
    `Title: ${clean(project.title)}`,
    `Subtitle: ${clean(project.subtitle)}`,
    `Author: ${clean(metadata.author) || "Freddy Bremseth"}`,
    `Series: ${clean(project.series_name)}`,
    `Language: ${clean(project.language) || "en"}`,
    `Description: ${clean(kdp.description_html) || clean(kdp.description)}`,
    `Keywords: ${keywords.join("; ")}`,
    `Categories: ${categories.join("; ")}`,
    `Source Project ID: ${clean(project.id)}`,
  ];
  return Buffer.from(lines.join("\n"), "utf8");
}

export function sha256Bytes(bytes: Uint8Array | Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function artifactInput(
  identity: BookProductionHandoffIdentity,
  spec: { assetType: string; role: string; filename: string; bytes: Uint8Array | Buffer; mimeType: string; canonical?: boolean },
): ArtifactUploadTicketInput {
  return {
    workKey: identity.workKey,
    editionKey: identity.editionKey,
    revisionNumber: identity.revisionNumber,
    assetType: spec.assetType,
    role: spec.role,
    filename: spec.filename,
    fingerprint: sha256Bytes(spec.bytes),
    size: spec.bytes.byteLength,
    mimeType: spec.mimeType,
    canonical: spec.canonical !== false,
  };
}

export function handoffReadiness(project: Record<string, any>, hasCover: boolean) {
  return productionHandoffPreflight(project, hasCover);
}
