import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { exportMediaAssetToContentHub } from "@/services/media/content-hub-export";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const { data: campaign, error: campaignError } = await context.supabase
      .from("ad_campaigns")
      .select("name,brand_id,product_name")
      .eq("id", params.id)
      .maybeSingle();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) {
      return NextResponse.json({ error: "Kampanjen ble ikke funnet." }, { status: 404 });
    }

    const { data: creatives, error } = await context.supabase
      .from("ad_creatives")
      .select("id,output_asset_id,pushed_to_hub,hub_content_id,image_url,thumbnail_url,angle,scene_id,aspect_ratio,caption_primary,caption_secondary,hashtags,metadata_json")
      .eq("campaign_id", params.id)
      .eq("status", "completed");
    if (error) throw new Error(error.message);

    const all = creatives || [];
    const pending = all.filter((creative) => !creative.pushed_to_hub);
    const exported: string[] = [];
    const failed: Array<{ creativeId: string; error: string }> = [];

    for (let index = 0; index < pending.length; index += 5) {
      const batch = pending.slice(index, index + 5);
      const results = await Promise.allSettled(batch.map(async (creative) => {
        if (!creative.image_url) throw new Error("Ferdig annonse mangler bildeadresse.");
        const requiresLabelReview = creative.metadata_json?.creative_image_label_review_required === true;
        const title = `${campaign.name} · ${creative.angle || creative.scene_id} · ${creative.aspect_ratio}`;
        const caption = creative.caption_primary || `Produkt: ${campaign.product_name}`;
        const description = [caption, ...(creative.hashtags?.length ? [creative.hashtags.join(" ")] : [])].join("\n");
        const tags = ["ad-campaign", campaign.product_name, creative.angle, creative.scene_id, creative.aspect_ratio,
          ...(requiresLabelReview ? ["needs-product-label-review"] : [])].filter(Boolean);

        let publicationId: string;
        if (creative.hub_content_id) {
          // Recover an export whose previous status update was interrupted.
          const { data: existing, error: existingError } = await context.supabase
            .from("content_publications")
            .select("id")
            .eq("id", creative.hub_content_id)
            .maybeSingle();
          if (existingError) throw new Error(existingError.message);
          if (existing) publicationId = String(existing.id);
          else publicationId = "";
        } else {
          publicationId = "";
        }

        if (!publicationId) {
          // A completed image can predate Media Studio's asset linkage.
          // Look up the existing draft first so retries never duplicate it.
          const { data: existing, error: lookupError } = await context.supabase
            .from("content_publications")
            .select("id")
            .eq("campaign_id", params.id)
            .eq("ai_image_url", creative.image_url)
            .limit(1)
            .maybeSingle();
          if (lookupError) throw new Error(lookupError.message);
          if (existing) publicationId = String(existing.id);
        }

        if (!publicationId && creative.output_asset_id) {
          const publication = await exportMediaAssetToContentHub(context.supabase, {
            organizationId: context.scope.organizationId,
            actorEmail: context.scope.actorEmail,
            assetId: String(creative.output_asset_id),
          });
          publicationId = String(publication.id);
        }

        if (!publicationId) {
          // Legacy fallback: keep the user-generated image, create only a
          // reviewable draft; do not schedule or publish anything.
          const { data: draft, error: draftError } = await context.supabase
            .from("content_publications")
            .insert({
              brand_id: campaign.brand_id || "media-studio",
              content_type: "image_post",
              title,
              description,
              tags,
              status: "draft",
              ai_generated: true,
              ai_title: title,
              ai_description: caption,
              ai_tags: creative.hashtags || [],
              ai_image_url: creative.image_url,
              thumbnail_url: creative.thumbnail_url || null,
              media_urls: [creative.image_url],
              campaign_id: params.id,
              content_features: {
                requires_label_review: requiresLabelReview,
                ...(requiresLabelReview ? { label_approval_pending: true, product_volume: "3 L" } : {}),
                source_ad_creative_id: creative.id,
                secondary_caption: creative.caption_secondary || null,
              },
            })
            .select("id")
            .single();
          if (draftError || !draft) throw new Error(draftError?.message || "Content Hub-utkastet ble ikke lagret.");
          publicationId = String(draft.id);
        }

        // Normalize both Media Library and legacy draft paths. Preserving the
        // review flag in content_features means draft editors can show the
        // correct readiness state, while the publisher also rechecks sources.
        const { data: existingDraft, error: existingDraftError } = await context.supabase
          .from("content_publications")
          .select("content_features,status")
          .eq("id", publicationId)
          .eq("brand_id", campaign.brand_id || "media-studio")
          .maybeSingle();
        if (existingDraftError || !existingDraft) throw new Error(existingDraftError?.message || "Utkastet mangler.");
        if (existingDraft.status !== "draft") {
          throw new Error("Et tidligere eksportert innlegg er ikke lenger et utkast. Kontrollér det manuelt.");
        }
        const { error: draftUpdateError } = await context.supabase
          .from("content_publications")
          .update({
            title,
            description,
            ai_title: title,
            ai_description: caption,
            ai_tags: creative.hashtags || [],
            tags,
            campaign_id: params.id,
            content_features: {
              ...(existingDraft.content_features || {}),
              requires_label_review: requiresLabelReview,
              ...(requiresLabelReview ? { label_approval_pending: true, product_volume: "3 L" } : {}),
              source_ad_creative_id: creative.id,
              secondary_caption: creative.caption_secondary || null,
            },
          })
          .eq("id", publicationId)
          .eq("brand_id", campaign.brand_id || "media-studio");
        if (draftUpdateError) throw new Error(draftUpdateError.message);

        const { error: syncError } = await context.supabase
          .from("ad_creatives")
          .update({ pushed_to_hub: true, hub_content_id: publicationId })
          .eq("campaign_id", params.id)
          .eq("id", creative.id);
        if (syncError) throw new Error(`Utkast opprettet, men synkronisering feilet: ${syncError.message}`);
        return creative.id;
      }));

      results.forEach((result, resultIndex) => {
        const creative = batch[resultIndex];
        if (result.status === "fulfilled") exported.push(result.value);
        else failed.push({
          creativeId: creative.id,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      });
    }

    return NextResponse.json({
      exported: exported.length,
      alreadyExported: all.filter((creative) => creative.pushed_to_hub).length,
      failed,
      totalAssets: all.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}
