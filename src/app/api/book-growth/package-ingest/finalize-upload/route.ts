import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  PUBLICATION_ASSET_BUCKET,
  publicationArtifactStoragePath,
  sha256Buffer,
  validateArtifactUploadTicketInput,
  verifiedManifestAsset,
} from "@/lib/publishing/publication-artifact-upload";
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
    return NextResponse.json({ error: "Invalid artifact finalize request", details: validation.errors }, { status: 400 });
  }

  const expectedPath = publicationArtifactStoragePath(validation.value);
  const suppliedPath = typeof body?.storagePath === "string" ? body.storagePath.trim() : "";
  if (!suppliedPath || suppliedPath !== expectedPath) {
    return NextResponse.json({ error: "storagePath does not match the immutable Book OS path" }, { status: 409 });
  }

  const { data, error } = await supabase.storage.from(PUBLICATION_ASSET_BUCKET).download(expectedPath);
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Uploaded artifact not found" }, { status: 404 });
  }

  const bytes = await data.arrayBuffer();
  const actualSize = bytes.byteLength;
  const actualFingerprint = sha256Buffer(bytes);
  const sizeMatches = actualSize === validation.value.size;
  const hashMatches = actualFingerprint === validation.value.fingerprint;

  if (!sizeMatches || !hashMatches) {
    await supabase.storage.from(PUBLICATION_ASSET_BUCKET).remove([expectedPath]).catch(() => undefined);
    return NextResponse.json({
      error: "Artifact verification failed; the uploaded object was removed",
      expected: { size: validation.value.size, fingerprint: validation.value.fingerprint },
      actual: { size: actualSize, fingerprint: actualFingerprint },
      finalized: false,
      ingested: false,
    }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    finalized: true,
    ingested: false,
    asset: verifiedManifestAsset(validation.value, expectedPath),
    verification: { size: actualSize, fingerprint: actualFingerprint, checksum: "sha256" },
    next: "Add the verified asset to the publication package manifest, then preview and ingest the package.",
  });
}
