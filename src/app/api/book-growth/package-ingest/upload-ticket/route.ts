import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import {
  PUBLICATION_ASSET_BUCKET,
  publicationArtifactStoragePath,
  validateArtifactUploadTicketInput,
} from "@/lib/publishing/publication-artifact-upload";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const input = await request.json().catch(() => null);
  const validation = validateArtifactUploadTicketInput(input);
  if (!validation.ok) {
    return NextResponse.json({ error: "Invalid artifact upload request", details: validation.errors }, { status: 400 });
  }

  const storagePath = publicationArtifactStoragePath(validation.value);
  const { data, error } = await supabase.storage
    .from(PUBLICATION_ASSET_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false });

  if (error) {
    const unavailable = /bucket|not found|does not exist/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: unavailable ? 503 : 409 });
  }

  return NextResponse.json({
    ok: true,
    bucket: PUBLICATION_ASSET_BUCKET,
    storagePath,
    token: data.token,
    signedUrl: data.signedUrl,
    expiresInSeconds: 7200,
    expected: {
      fingerprint: validation.value.fingerprint,
      size: validation.value.size,
      assetType: validation.value.assetType,
      role: validation.value.role,
      canonical: validation.value.canonical,
    },
    finalized: false,
    ingested: false,
  });
}
