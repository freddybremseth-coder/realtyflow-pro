import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { PUBLICATION_ASSET_BUCKET } from "@/lib/publishing/publication-artifact-upload";
import { seriesBatchStoragePath, validateSeriesBatchUploadInput } from "@/lib/publishing/publication-series-batch";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json().catch(() => null);
  const validation = validateSeriesBatchUploadInput(body);
  if (!validation.ok) return NextResponse.json({ error: "Invalid series batch upload", details: validation.errors }, { status: 400 });

  const storagePath = seriesBatchStoragePath(validation.value);
  const { data, error } = await supabase.storage.from(PUBLICATION_ASSET_BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data?.token) return NextResponse.json({ error: error?.message || "Could not create batch upload ticket" }, { status: 500 });

  return NextResponse.json({ bucket: PUBLICATION_ASSET_BUCKET, storagePath, token: data.token });
}
