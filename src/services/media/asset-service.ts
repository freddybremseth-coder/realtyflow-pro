import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadThumbnail } from "@/services/storage/media";
import type { MediaPromptPlan } from "./types";

const MEDIA_BUCKET = "media-studio";
const MAX_REMOTE_ASSET_BYTES = 500 * 1024 * 1024;

function extForMime(mimeType: string) {
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "png";
}

function mediaTypeForMime(mimeType: string) {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "image";
}

function safePathPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "asset";
}

async function downloadRemoteAsset(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    throw new Error("Provider-resultatet må være en HTTP(S)-URL.");
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Kunne ikke laste ned provider-resultatet (${res.status}).`);

  const length = Number(res.headers.get("content-length") || 0);
  if (length > MAX_REMOTE_ASSET_BYTES) {
    throw new Error("Provider-resultatet er større enn tillatt lagringsgrense.");
  }

  const mimeType = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_REMOTE_ASSET_BYTES) {
    throw new Error("Provider-resultatet er større enn tillatt lagringsgrense.");
  }
  return { buffer, mimeType };
}

export interface PersistMediaAssetInput {
  organizationId: string;
  userId?: string | null;
  actorEmail: string;
  jobId: string;
  promptPlanId?: string | null;
  projectId?: string | null;
  brandId?: string | null;
  campaignId?: string | null;
  propertyId?: string | null;
  plan: MediaPromptPlan;
  provider: string;
  model?: string | null;
  sourceAssetIds?: string[];
  remoteUrl?: string;
  inlineBase64?: string;
  mimeType?: string;
  title?: string;
  description?: string;
  thumbnailUrl?: string | null;
  aiEdited?: boolean;
}

export async function persistMediaAsset(
  supabase: SupabaseClient,
  input: PersistMediaAssetInput,
) {
  const downloaded = input.remoteUrl
    ? await downloadRemoteAsset(input.remoteUrl)
    : {
        buffer: Buffer.from(input.inlineBase64 || "", "base64"),
        mimeType: input.mimeType || "image/png",
      };

  if (!downloaded.buffer.byteLength) throw new Error("Provider-resultatet var tomt.");

  const mediaType = mediaTypeForMime(downloaded.mimeType);
  const ext = extForMime(downloaded.mimeType);
  const storagePath = [
    input.organizationId,
    input.jobId,
    `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`,
  ].map(safePathPart).join("/");

  const { error: uploadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, downloaded.buffer, {
      contentType: downloaded.mimeType,
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadError) throw new Error(`Kunne ikke lagre media-asset: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;
  const generatedThumbnail = mediaType === "image"
    ? await uploadThumbnail(supabase, downloaded.buffer, downloaded.mimeType, storagePath)
    : null;

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId || null,
      project_id: input.projectId || null,
      brand_id: input.brandId || input.plan.brandId || null,
      campaign_id: input.campaignId || null,
      property_id: input.propertyId || null,
      job_id: input.jobId,
      prompt_plan_id: input.promptPlanId || null,
      media_type: mediaType,
      asset_type: input.aiEdited ? "ai_edited" : "generated",
      title: input.title || `${input.plan.useCase || input.plan.mediaType} asset`,
      description: input.description || input.plan.originalRequest,
      storage_bucket: MEDIA_BUCKET,
      storage_path: storagePath,
      public_url: publicUrl,
      signed_url_required: false,
      thumbnail_url: input.thumbnailUrl || generatedThumbnail,
      mime_type: downloaded.mimeType,
      file_size: downloaded.buffer.byteLength,
      provider: input.provider,
      model: input.model || null,
      prompt: input.plan.optimizedPrompt,
      negative_prompt: input.plan.negativePrompt || null,
      aspect_ratio: input.plan.aspectRatio || null,
      resolution: input.plan.resolution || null,
      ai_generated: true,
      ai_edited: Boolean(input.aiEdited),
      source_asset_ids: input.sourceAssetIds || [],
      metadata_json: {
        actorEmail: input.actorEmail,
        originalRequest: input.plan.originalRequest,
        providerRemoteUrl: input.remoteUrl || null,
        promptBlocks: input.plan.promptBlocks,
        safetyNotes: input.plan.safetyNotes,
      },
      tags: [
        input.plan.mediaType,
        input.plan.useCase || "media",
        input.plan.platform || "",
        input.brandId || input.plan.brandId || "",
      ].filter(Boolean),
    })
    .select("*")
    .single();

  if (error) throw new Error(`Kunne ikke registrere media-asset: ${error.message}`);

  if (mediaType === "image") {
    try {
      await supabase.from("user_image_bank").insert({
        owner: input.brandId || input.plan.brandId || "media-studio",
        url: publicUrl,
        thumbnail_url: input.thumbnailUrl || generatedThumbnail,
        name: input.title || "AI Media Studio asset",
        kind: input.aiEdited ? "variant" : "image",
        tags: ["media-studio", input.plan.useCase || "generated"].filter(Boolean),
        size_bytes: downloaded.buffer.byteLength,
      });
    } catch {
      // Non-critical compatibility mirror.
    }
  }

  try {
    await supabase.from("media_usage_events").insert({
      organization_id: input.organizationId,
      user_id: input.userId || null,
      event_type: "asset_saved",
      provider: input.provider,
      media_type: mediaType,
      job_id: input.jobId,
      asset_id: data.id,
      prompt_plan_id: input.promptPlanId || null,
      cost_tier: input.plan.estimatedCostTier,
      metadata_json: { actorEmail: input.actorEmail },
    });
  } catch {
    // Usage logging must not fail the asset.
  }

  return data;
}
