import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { uploadThumbnail } from "@/services/storage/media";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEDIA_BUCKET = "media-studio";
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const metadataSchema = z.object({
  brandId: z.string().max(80).optional(),
  projectId: z.string().uuid().optional(),
  title: z.string().trim().max(200).optional(),
});

function safePathPart(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "") || "reference";
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "png";
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const form = await request.formData();
    const fileValue = form.get("file");
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "Velg en bildefil som skal lastes opp." }, { status: 400 });
    }

    if (!ALLOWED_IMAGE_TYPES.has(fileValue.type)) {
      return NextResponse.json({ error: "Bildet må være JPG, PNG, WebP eller GIF." }, { status: 415 });
    }
    if (fileValue.size <= 0 || fileValue.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Bildet må være mindre enn 25 MB." }, { status: 413 });
    }

    const metadata = metadataSchema.parse({
      brandId: String(form.get("brandId") || "") || undefined,
      projectId: String(form.get("projectId") || "") || undefined,
      title: String(form.get("title") || "") || undefined,
    });

    const buffer = Buffer.from(await fileValue.arrayBuffer());
    const extension = extensionForMime(fileValue.type);
    const originalBase = fileValue.name.replace(/\.[^.]+$/, "");
    const storagePath = [
      context.scope.organizationId,
      "references",
      `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safePathPart(originalBase)}.${extension}`,
    ].join("/");

    const { error: uploadError } = await context.supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, buffer, {
        contentType: fileValue.type,
        upsert: false,
        cacheControl: "31536000",
      });
    if (uploadError) throw new Error(`Kunne ikke laste opp referansebildet: ${uploadError.message}`);

    const { data: publicData } = context.supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    const thumbnailUrl = await uploadThumbnail(context.supabase, buffer, fileValue.type, storagePath);
    const title = metadata.title || originalBase || "Referansebilde";

    const { data: asset, error: assetError } = await context.supabase
      .from("media_assets")
      .insert({
        organization_id: context.scope.organizationId,
        user_id: context.scope.userId || null,
        project_id: metadata.projectId || null,
        brand_id: metadata.brandId || null,
        media_type: "image",
        asset_type: "uploaded_reference",
        title,
        description: "Opplastet referansebilde for AI Media Studio",
        storage_bucket: MEDIA_BUCKET,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        signed_url_required: false,
        thumbnail_url: thumbnailUrl,
        mime_type: fileValue.type,
        file_size: buffer.byteLength,
        provider: "upload",
        ai_generated: false,
        ai_edited: false,
        metadata_json: {
          actorEmail: context.scope.actorEmail,
          originalFilename: fileValue.name,
          purpose: "media_reference",
        },
        tags: ["media-studio", "reference", metadata.brandId || ""].filter(Boolean),
        status: "active",
      })
      .select("*")
      .single();
    if (assetError) {
      await context.supabase.storage.from(MEDIA_BUCKET).remove([storagePath]).catch(() => undefined);
      throw new Error(`Kunne ikke registrere referansebildet: ${assetError.message}`);
    }

    try {
      await context.supabase.from("user_image_bank").insert({
        owner: metadata.brandId || "media-studio",
        url: publicData.publicUrl,
        thumbnail_url: thumbnailUrl,
        name: title,
        kind: "reference",
        tags: ["media-studio", "reference"],
        size_bytes: buffer.byteLength,
      });
    } catch {
      // Compatibility mirror is best effort.
    }

    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
