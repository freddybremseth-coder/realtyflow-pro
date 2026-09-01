import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  PUBLICATION_ASSET_BUCKET,
  publicationArtifactStoragePath,
  sha256Buffer,
  validateArtifactUploadTicketInput,
  verifiedManifestAsset,
} from "@/lib/publishing/publication-artifact-upload";
import { expandPublicationPackage } from "@/lib/publishing/publication-artifact-package-expander";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const validation = validateArtifactUploadTicketInput(body);
  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid publication package request", details: validation.errors }, { status: 400 });
  }
  if (validation.value.assetType !== "package_zip" || validation.value.role !== "complete_publication_package") {
    return NextResponse.json({ error: "Only a verified complete_publication_package ZIP can be expanded" }, { status: 400 });
  }

  const expectedPath = publicationArtifactStoragePath(validation.value);
  const suppliedPath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
  if (!suppliedPath || suppliedPath !== expectedPath) {
    return NextResponse.json({ error: "storagePath does not match the immutable Book OS package path" }, { status: 409 });
  }

  const { data: packageBlob, error: packageError } = await supabase.storage.from(PUBLICATION_ASSET_BUCKET).download(expectedPath);
  if (packageError || !packageBlob) {
    return NextResponse.json({ error: packageError?.message || "Verified publication package not found" }, { status: 404 });
  }
  const packageBytes = new Uint8Array(await packageBlob.arrayBuffer());
  if (packageBytes.byteLength !== validation.value.size || sha256Buffer(packageBytes) !== validation.value.fingerprint) {
    return NextResponse.json({ error: "Stored publication package no longer matches the verified checksum" }, { status: 409 });
  }

  let expanded;
  try {
    expanded = await expandPublicationPackage(packageBytes, validation.value);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 });
  }

  const verifiedAssets = [];
  const createdPaths: string[] = [];
  try {
    for (const item of expanded.assets) {
      const storage = supabase.storage.from(PUBLICATION_ASSET_BUCKET);
      const { error: uploadError } = await storage.upload(item.storagePath, item.bytes, {
        contentType: item.input.mimeType || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) {
        const { data: existing, error: downloadError } = await storage.download(item.storagePath);
        if (downloadError || !existing) throw uploadError;
        const existingBytes = new Uint8Array(await existing.arrayBuffer());
        if (existingBytes.byteLength !== item.input.size || sha256Buffer(existingBytes) !== item.input.fingerprint) {
          throw new Error(`Immutable path collision for ${item.input.role}`);
        }
      } else {
        createdPaths.push(item.storagePath);
      }
      verifiedAssets.push(verifiedManifestAsset(item.input, item.storagePath));
    }
  } catch (error) {
    if (createdPaths.length) await supabase.storage.from(PUBLICATION_ASSET_BUCKET).remove(createdPaths).catch(() => undefined);
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      expanded: false,
      ingested: false,
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    expanded: true,
    ingested: false,
    packageAsset: verifiedManifestAsset(validation.value, expectedPath),
    assets: verifiedAssets,
    ignoredEntries: expanded.ignoredEntries,
    next: "Review the assembled manifest, preview gates, then ingest the package. Quality Center remains mandatory.",
  });
}
