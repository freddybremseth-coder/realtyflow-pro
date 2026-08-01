import type { SupabaseClient } from "@supabase/supabase-js";

function contentTypeForAsset(asset: Record<string, unknown>) {
  const mediaType = String(asset.media_type || "image");
  if (mediaType === "video") return "video";
  if (mediaType === "audio") return "audio";
  return "image_post";
}

export async function exportMediaAssetToContentHub(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    actorEmail: string;
    assetId: string;
    title?: string;
    description?: string;
  },
) {
  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("*")
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Fant ikke media-asseten.");

  const assetUrl = String(asset.public_url || "");
  if (!assetUrl) throw new Error("Asseten mangler URL og kan ikke sendes til Content Hub.");

  const title = params.title || String(asset.title || "AI Media Studio asset");
  const description = params.description || String(asset.description || asset.prompt || "");
  const mediaType = String(asset.media_type || "image");
  const isImage = mediaType === "image";

  const { data: publication, error } = await supabase
    .from("content_publications")
    .insert({
      brand_id: asset.brand_id || "media-studio",
      content_type: contentTypeForAsset(asset),
      title,
      description,
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      status: "draft",
      ai_generated: Boolean(asset.ai_generated),
      ai_title: title,
      ai_description: description,
      ai_tags: Array.isArray(asset.tags) ? asset.tags : [],
      ai_image_url: isImage ? assetUrl : null,
      media_urls: [assetUrl],
      campaign_id: asset.campaign_id || null,
      thumbnail_url: asset.thumbnail_url || null,
    })
    .select("id, title, status")
    .single();

  if (error) throw new Error(`Kunne ikke sende til Content Hub: ${error.message}`);

  await supabase
    .from("media_assets")
    .update({
      content_hub_publication_id: publication.id,
      exported_to_content_hub_at: new Date().toISOString(),
    })
    .eq("id", params.assetId);

  await supabase.from("media_asset_links").upsert({
    organization_id: params.organizationId,
    asset_id: params.assetId,
    entity_type: "content_hub_draft",
    entity_id: publication.id,
    relationship_type: "exported_to",
  }, { onConflict: "asset_id,entity_type,entity_id,relationship_type" });

  const metadata = asset.metadata_json && typeof asset.metadata_json === "object"
    ? asset.metadata_json as Record<string, unknown>
    : {};
  try {
    await supabase.from("media_usage_events").insert({
      organization_id: params.organizationId,
      event_type: "asset_exported_to_content_hub",
      provider: asset.provider || null,
      media_type: asset.media_type || null,
      job_id: asset.job_id || null,
      asset_id: params.assetId,
      cost_tier: metadata.estimatedCostTier || null,
      metadata_json: { actorEmail: params.actorEmail, publicationId: publication.id },
    });
  } catch {
    // Export succeeded; usage logging is best-effort.
  }

  return publication;
}
