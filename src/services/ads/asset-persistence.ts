import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadThumbnail } from "@/services/storage/media";
import type { ConcreteAdProvider } from "./provider-engine";

interface CampaignRow {
  id: string;
  tenant_id?: string | null;
  media_project_id?: string | null;
  user_id?: string | null;
  brand_id?: string | null;
  name: string;
  product_name: string;
  product_image_url: string;
  overlay_mode?: string | null;
}

interface CreativeRow {
  id: string;
  scene_id: string;
  concept_group?: string | null;
  variant_index?: number | null;
  angle: string;
  aspect_ratio: string;
  prompt: string;
  overlay_headline?: string | null;
  overlay_subheadline?: string | null;
  overlay_cta?: string | null;
  overlay_badge?: string | null;
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

export async function ensureAdCampaignMediaProject(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    actorEmail: string;
    campaign: CampaignRow;
  },
) {
  if (params.campaign.media_project_id) return params.campaign.media_project_id;

  const { data, error } = await supabase
    .from("media_projects")
    .insert({
      organization_id: params.organizationId,
      user_id: params.campaign.user_id || null,
      name: params.campaign.name,
      description: `Ad Campaign Generator · ${params.campaign.product_name}`,
      project_type: "ad_campaign",
      brand_id: params.campaign.brand_id || null,
      status: "active",
      metadata_json: {
        actorEmail: params.actorEmail,
        adCampaignId: params.campaign.id,
        source: "ad_campaign_generator",
      },
    })
    .select("id")
    .single();
  if (error) throw new Error(`Kunne ikke opprette Media Studio-prosjekt: ${error.message}`);

  await supabase
    .from("ad_campaigns")
    .update({ media_project_id: data.id })
    .eq("id", params.campaign.id);

  return String(data.id);
}

export async function persistAdCreativeImage(
  supabase: SupabaseClient,
  params: {
    organizationId?: string | null;
    actorEmail?: string | null;
    campaign: CampaignRow;
    creative: CreativeRow;
    provider: ConcreteAdProvider;
    model: string;
    bytes?: Buffer;
    sourceUrl?: string;
    mimeType?: string;
    fallbackFrom?: ConcreteAdProvider;
  },
) {
  let mimeType = params.mimeType || "image/png";
  let bytes = params.bytes;

  if (!bytes) {
    if (!params.sourceUrl) throw new Error("Mangler bildekilde for ferdig creative.");
    const response = await fetch(params.sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Kunne ikke laste ned generert bilde (${response.status}).`);
    mimeType = response.headers.get("content-type")?.split(";")[0] || mimeType;
    bytes = Buffer.from(await response.arrayBuffer());
  }

  const extension = extensionForMime(mimeType);
  const bucket = "ad-creatives";
  const storagePath = `${params.campaign.id}/${params.creative.scene_id}_${params.creative.aspect_ratio.replace(":", "x")}_${params.creative.id.slice(0, 8)}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true, cacheControl: "31536000" });
  if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  const thumbnailUrl = await uploadThumbnail(supabase, bytes, mimeType, storagePath);

  let outputAssetId: string | null = null;
  if (params.organizationId) {
    const mediaProjectId = await ensureAdCampaignMediaProject(supabase, {
      organizationId: params.organizationId,
      actorEmail: params.actorEmail || "system",
      campaign: params.campaign,
    }).catch(() => params.campaign.media_project_id || null);

    const { data: sourceAsset } = await supabase
      .from("media_assets")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("public_url", params.campaign.product_image_url)
      .maybeSingle();

    const { data: asset, error: assetError } = await supabase
      .from("media_assets")
      .insert({
        organization_id: params.organizationId,
        user_id: params.campaign.user_id || null,
        project_id: mediaProjectId || null,
        brand_id: params.campaign.brand_id || null,
        campaign_id: params.campaign.id,
        media_type: "image",
        asset_type: "ad_creative",
        title: `${params.campaign.name} · ${params.creative.angle} · variant ${params.creative.variant_index || 1}`,
        description: params.creative.overlay_headline || params.creative.angle,
        storage_bucket: bucket,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        signed_url_required: false,
        thumbnail_url: thumbnailUrl,
        mime_type: mimeType,
        file_size: bytes.byteLength,
        provider: params.provider,
        model: params.model,
        prompt: params.creative.prompt,
        aspect_ratio: params.creative.aspect_ratio,
        ai_generated: true,
        ai_edited: false,
        source_asset_ids: sourceAsset?.id ? [sourceAsset.id] : [],
        metadata_json: {
          actorEmail: params.actorEmail || "system",
          adCampaignId: params.campaign.id,
          adCreativeId: params.creative.id,
          sceneId: params.creative.scene_id,
          conceptGroup: params.creative.concept_group,
          variantIndex: params.creative.variant_index || 1,
          overlayMode: params.campaign.overlay_mode || "suggestions",
          overlay: {
            headline: params.creative.overlay_headline,
            subheadline: params.creative.overlay_subheadline,
            cta: params.creative.overlay_cta,
            badge: params.creative.overlay_badge,
          },
          fallbackFrom: params.fallbackFrom || null,
        },
        tags: [
          "ad-campaign",
          params.creative.concept_group || params.creative.angle,
          params.provider,
          params.creative.aspect_ratio,
        ],
        status: "active",
      })
      .select("id")
      .single();

    if (!assetError && asset?.id) outputAssetId = String(asset.id);
  }

  await supabase
    .from("ad_creatives")
    .update({
      status: "completed",
      image_url: publicData.publicUrl,
      thumbnail_url: thumbnailUrl,
      source_url: params.sourceUrl || null,
      provider: params.provider,
      model: params.model,
      output_asset_id: outputAssetId,
      error: null,
      metadata_json: {
        completedAt: new Date().toISOString(),
        fallbackFrom: params.fallbackFrom || null,
      },
    })
    .eq("id", params.creative.id);

  return {
    imageUrl: publicData.publicUrl,
    thumbnailUrl,
    outputAssetId,
    storagePath,
  };
}
