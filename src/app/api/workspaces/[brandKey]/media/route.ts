import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { getDefaultMediaOrganizationId } from "@/services/media/organization";
import { uploadThumbnail } from "@/services/storage/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "media-studio";
const MAX_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const noStore = { "Cache-Control": "private, no-store" };
const failure = (status: number, message: string) =>
  NextResponse.json({ error: message }, { status, headers: noStore });

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.read");
  if (!access.value) return access.response;
  const { data, error } = await access.value.supabase
    .from("media_assets")
    .select("id,title,media_type,public_url,thumbnail_url,provider,created_at")
    .eq("brand_id", params.brandKey)
    .eq("media_type", "image")
    .eq("status", "active")
    .eq("signed_url_required", false)
    .is("deleted_at", null)
    .not("public_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(120);
  if (error) return failure(503, "Kunne ikke hente bildebiblioteket.");
  return NextResponse.json({ assets: data || [] }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.draft");
  if (!access.value) return access.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return failure(400, "Velg en bildefil.");
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) return failure(415, "Bruk JPG, PNG, WebP eller GIF.");
  if (!file.size || file.size > MAX_BYTES) return failure(413, "Maksimal bildestørrelse er 25 MB.");

  const supabase = access.value.supabase;
  let organizationId: string;
  try {
    organizationId = await getDefaultMediaOrganizationId(supabase);
  } catch {
    return failure(503, "Bildebiblioteket er ikke tilgjengelig.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const basename = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 70) || "bilde";
  const storagePath = [organizationId, "workspace", params.brandKey,
    `${Date.now()}-${crypto.randomUUID()}-${basename}.${extension}`].join("/");
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type, upsert: false, cacheControl: "31536000",
  });
  if (uploadError) return failure(503, "Opplasting mislyktes.");

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  let thumbnailUrl: string | null = null;
  try {
    thumbnailUrl = await uploadThumbnail(supabase, bytes, file.type, storagePath);
  } catch {
    // Original public image remains usable if thumbnail generation fails.
  }
  const { data: asset, error: insertError } = await supabase.from("media_assets").insert({
    organization_id: organizationId,
    user_id: access.value.verifiedUserId,
    brand_id: params.brandKey,
    media_type: "image",
    asset_type: "uploaded_reference",
    title: basename,
    description: "Manuelt SoMe-bilde",
    storage_bucket: BUCKET,
    storage_path: storagePath,
    public_url: publicData.publicUrl,
    thumbnail_url: thumbnailUrl,
    signed_url_required: false,
    mime_type: file.type,
    file_size: bytes.length,
    provider: "upload",
    ai_generated: false,
    ai_edited: false,
    metadata_json: { purpose: "media_reference", source: "workspace_manual_social" },
    tags: ["workspace", "social", params.brandKey],
    status: "active",
  }).select("id,title,media_type,public_url,thumbnail_url,provider,created_at").single();
  if (insertError || !asset) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return failure(503, "Bildet ble lastet opp, men kunne ikke registreres.");
  }
  return NextResponse.json({ asset }, { status: 201, headers: noStore });
}
