import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { toEpubBuffer } from "@/lib/publishing/epub-export";
import { bookProjectCoverUrl, fetchBookImage, toBookProjectDocxBuffer } from "@/lib/publishing/book-project-docx-export";
import {
  artifactInput,
  bookProductionHandoffIdentity,
  bookProductionRetailerMetadata,
  handoffReadiness,
  sha256Bytes,
} from "@/lib/publishing/book-production-handoff";
import {
  PUBLICATION_ASSET_BUCKET,
  publicationArtifactStoragePath,
  sha256Buffer,
  verifiedManifestAsset,
} from "@/lib/publishing/publication-artifact-upload";
import { publicationPackageGateSummary, validatePublicationPackageManifest } from "@/lib/publishing/publication-package";
import { printProfileSummary } from "@/lib/publishing/book-print-production";
import { renderBookPrintInterior, renderKdpFullWrap } from "@/services/publishing/book-print-renderer";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function slug(value: unknown) {
  return String(value || "book").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "book";
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const id = String(body?.id || "").trim();
  const revisionNumber = Math.max(1, Math.trunc(Number(body?.revisionNumber || 1)));
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data, error } = await supabase.from("publishing_book_projects").select("*").eq("id", id).single();
  if (error || !data) return NextResponse.json({ error: error?.message || "Book project not found" }, { status: 404 });
  const project = data as Record<string, any>;
  const coverUrl = bookProjectCoverUrl(project);
  const cover = coverUrl ? await fetchBookImage(coverUrl) : null;
  const readiness = handoffReadiness(project, Boolean(cover));
  if (!readiness.ok) return NextResponse.json({ error: "Book project is not ready for production handoff", readiness }, { status: 409 });
  if (!cover) return NextResponse.json({ error: "Canonical cover could not be loaded" }, { status: 409 });
  if (cover.type !== "jpg" && cover.type !== "png") {
    return NextResponse.json({ error: `Print production requires a JPG or PNG canonical cover; received ${cover.type}` }, { status: 409 });
  }

  const identity = bookProductionHandoffIdentity(project, revisionNumber);
  const titleSlug = slug(project.title);
  const docx = await toBookProjectDocxBuffer(project);
  const epub = await toEpubBuffer(project);
  const metadata = bookProductionRetailerMetadata(project);
  const coverExt = cover.type;
  const coverMime = cover.type === "jpg" ? "image/jpeg" : "image/png";

  let printInterior;
  let fullWrap;
  try {
    printInterior = await renderBookPrintInterior(project);
    fullWrap = await renderKdpFullWrap(project, printInterior.pageCount, { buffer: cover.buffer, type: cover.type });
  } catch (cause) {
    return NextResponse.json({
      error: cause instanceof Error ? cause.message : String(cause),
      prepared: false,
      ingested: false,
      productionStatus: "digital_ready",
      printPrepared: false,
    }, { status: 422 });
  }

  const printProfile = printProfileSummary(printInterior.pageCount);
  const publicationFiles = [
    { input: artifactInput(identity, { assetType: "manuscript_docx", role: "english_master", filename: `${titleSlug}_English_Master_r${revisionNumber}.docx`, bytes: docx, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), bytes: new Uint8Array(docx) },
    { input: artifactInput(identity, { assetType: "epub", role: "retailer_epub", filename: `${titleSlug}_r${revisionNumber}.epub`, bytes: epub, mimeType: "application/epub+zip" }), bytes: new Uint8Array(epub) },
    { input: artifactInput(identity, { assetType: "cover", role: "ebook_cover", filename: `${titleSlug}_Ebook_Cover_r${revisionNumber}.${coverExt}`, bytes: cover.buffer, mimeType: coverMime }), bytes: new Uint8Array(cover.buffer) },
    { input: artifactInput(identity, { assetType: "metadata", role: "retailer_metadata", filename: `${titleSlug}_Retailer_Metadata_r${revisionNumber}.txt`, bytes: metadata, mimeType: "text/plain" }), bytes: new Uint8Array(metadata) },
    { input: artifactInput(identity, { assetType: "pdf", role: "print_interior", filename: `${titleSlug}_Print_Interior_6x9_${printInterior.pageCount}pp_r${revisionNumber}.pdf`, bytes: printInterior.buffer, mimeType: "application/pdf" }), bytes: new Uint8Array(printInterior.buffer) },
    { input: artifactInput(identity, { assetType: "cover", role: "kdp_full_wrap", filename: `${titleSlug}_KDP_Full_Cover_6x9_${printInterior.pageCount}pp_r${revisionNumber}.pdf`, bytes: fullWrap.buffer, mimeType: "application/pdf", canonical: false }), bytes: new Uint8Array(fullWrap.buffer) },
  ];

  const report = Buffer.from([
    `Book OS Production Handoff`,
    `Project ID: ${project.id}`,
    `Status: publication_ready`,
    `Generated: ${new Date().toISOString()}`,
    `DOCX: generated`,
    `EPUB: generated`,
    `Ebook cover: verified from canonical project cover`,
    `Retailer metadata: generated`,
    `Print interior PDF: generated`,
    `Trim: 6x9 inches`,
    `Print page count: ${printInterior.pageCount}`,
    `Paper: cream`,
    `Spine width: ${fullWrap.spineWidthIn.toFixed(4)} inches`,
    `KDP full-wrap: generated`,
    `Full-wrap size: ${fullWrap.widthIn.toFixed(4)} x ${fullWrap.heightIn.toFixed(4)} inches`,
    `Quality Center remains mandatory after ingest.`,
  ].join("\n"), "utf8");

  const packageZip = new JSZip();
  for (const item of publicationFiles) packageZip.file(item.input.filename, item.bytes);
  packageZip.file("Production_Handoff_Report.txt", report);
  const packageBytes = await packageZip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const packageInput = artifactInput(identity, {
    assetType: "package_zip",
    role: "complete_publication_package",
    filename: `${titleSlug}_Complete_Publication_Package_r${revisionNumber}.zip`,
    bytes: packageBytes,
    mimeType: "application/zip",
  });

  const objects = [...publicationFiles, { input: packageInput, bytes: packageBytes }].map((item) => ({
    ...item,
    storagePath: publicationArtifactStoragePath(item.input),
  }));

  const storage = supabase.storage.from(PUBLICATION_ASSET_BUCKET);
  const created: string[] = [];
  try {
    for (const object of objects) {
      const { error: uploadError } = await storage.upload(object.storagePath, object.bytes, { contentType: object.input.mimeType || "application/octet-stream", upsert: false });
      if (uploadError) {
        const { data: existing, error: existingError } = await storage.download(object.storagePath);
        if (existingError || !existing) throw uploadError;
        const existingBytes = new Uint8Array(await existing.arrayBuffer());
        if (existingBytes.byteLength !== object.input.size || sha256Buffer(existingBytes) !== object.input.fingerprint) {
          throw new Error(`Immutable path collision for ${object.input.role}`);
        }
      } else {
        created.push(object.storagePath);
      }
    }
  } catch (cause) {
    if (created.length) await storage.remove(created).catch(() => undefined);
    return NextResponse.json({ error: cause instanceof Error ? cause.message : String(cause), prepared: false, ingested: false }, { status: 409 });
  }

  const assets = objects.map((object) => verifiedManifestAsset(object.input, object.storagePath));
  const metadataPlan = project.metadata_plan && typeof project.metadata_plan === "object" ? project.metadata_plan : {};
  const productionBible = metadataPlan.production_bible && typeof metadataPlan.production_bible === "object" ? metadataPlan.production_bible : {};
  const bookIdentity = productionBible.book_identity && typeof productionBible.book_identity === "object" ? productionBible.book_identity : {};
  const seriesNumberRaw = String(bookIdentity.book_number || "").match(/\d+/)?.[0];
  const manifestCandidate = {
    ingestKey: identity.ingestKey,
    workKey: identity.workKey,
    editionKey: identity.editionKey,
    title: String(project.title || "").trim(),
    subtitle: String(project.subtitle || "").trim(),
    seriesName: String(project.series_name || "").trim(),
    seriesNumber: seriesNumberRaw ? Number(seriesNumberRaw) : undefined,
    language: identity.language,
    format: identity.format,
    brandId: String(project.brand_id || "freddy_publishing"),
    revisionNumber: identity.revisionNumber,
    packageFingerprint: packageInput.fingerprint,
    contentFingerprint: publicationFiles[0].input.fingerprint,
    productionStatus: "publication_ready",
    source: "book_engine_production_handoff",
    assets,
  };
  const validation = validatePublicationPackageManifest(manifestCandidate);
  if (!validation.ok) {
    return NextResponse.json({ error: "Generated handoff manifest is invalid", details: validation.errors, prepared: true, ingested: false }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    prepared: true,
    ingested: false,
    projectId: project.id,
    productionStatus: "publication_ready",
    manifest: validation.manifest,
    gates: publicationPackageGateSummary(validation.manifest),
    readiness: { ...readiness, productionStatus: "publication_ready", warnings: [] },
    print: {
      pageCount: printInterior.pageCount,
      trim: printInterior.trim,
      paper: printProfile.paper,
      spineWidthIn: fullWrap.spineWidthIn,
      fullCoverWidthIn: fullWrap.widthIn,
      fullCoverHeightIn: fullWrap.heightIn,
      interiorWidthPt: printInterior.widthPt,
      interiorHeightPt: printInterior.heightPt,
    },
    generated: {
      docxFingerprint: publicationFiles[0].input.fingerprint,
      epubFingerprint: publicationFiles[1].input.fingerprint,
      coverFingerprint: publicationFiles[2].input.fingerprint,
      metadataFingerprint: publicationFiles[3].input.fingerprint,
      printInteriorFingerprint: publicationFiles[4].input.fingerprint,
      kdpFullWrapFingerprint: publicationFiles[5].input.fingerprint,
      packageFingerprint: sha256Bytes(packageBytes),
    },
    next: "Preview and ingest the publication-ready manifest into review. Quality Center remains mandatory before release.",
  });
}
