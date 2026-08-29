/**
 * Phase 7.1C — MarketingContentResolver-adapter. Søker i EKSISTERENDE systemer
 * (Content Hub via social_posts, Media/Image Studio via media_assets, Ad Builder
 * via ad_creatives) før noe nytt genereres. Ingen parallelle content-tabeller.
 *
 * Brand-isolasjon håndheves i flere lag: alle kilder er eksplisitt brand-scopet,
 * ad campaigns valideres mot ad_campaigns.brand_id, og resolver-kjernen
 * diskvalifiserer kandidater med feil brand. Ved uklar mapping genereres nytt.
 */

import {
  contentPublishabilityGate,
  resolveContent,
  type ContentCandidate,
  type ResolveDecision,
  type ResolverInput,
} from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export interface ResolverSourceMap {
  organizationId?: string | null;
  adCampaignIds?: string[] | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

async function searchContentHub(supabase: MarketingSupabaseLike, input: ResolverInput, orgId: string): Promise<ContentCandidate[]> {
  const { data } = await supabase
    .from("social_posts")
    .select("id, organization_id, platform, title, content, language, goal, hook_type, cta_type, status, campaign_id, quality_score, published_at, created_at, updated_at")
    .eq("organization_id", orgId)
    .eq("platform", input.channel)
    .in("status", ["approved", "review", "draft"])
    .limit(50);
  return (data ?? [])
    .filter((r: any) => {
      const kind = r.content_kind ?? r.metadata?.content_kind;
      if (kind && kind !== "publishable") return false;
      return contentPublishabilityGate(r.content ?? "").publishable;
    })
    .map((r: any) => ({
      source: r.status === "approved" ? "content_hub_approved" : "studio_reusable",
      contentId: `social_post:${r.id}`,
      brandId: input.brandId,
      channels: [String(r.platform)],
      language: r.language ?? null,
      text: r.content ?? "",
      status: r.status,
      humanApproved: r.status === "approved",
      genome: { channel: r.platform, hookType: r.hook_type ?? undefined, ctaType: r.cta_type ?? undefined, goal: r.goal ?? undefined, language: r.language ?? undefined },
      createdAt: r.created_at ?? null,
      lastUsedAt: r.published_at ?? null,
      factCheckedAt: r.updated_at ?? null,
      businessValue: num(r.quality_score),
    }));
}

async function searchMedia(supabase: MarketingSupabaseLike, input: ResolverInput): Promise<ContentCandidate[]> {
  const { data } = await supabase
    .from("media_assets")
    .select("id, brand_id, property_id, media_type, public_url, thumbnail_url, aspect_ratio, status, is_favorite, exported_to_content_hub_at, tags, created_at")
    .eq("brand_id", input.brandId)
    .eq("status", "active")
    .in("media_type", ["image", "video"])
    .limit(50);
  return (data ?? [])
    .filter((r: any) => !input.propertyIds?.length || (r.property_id && input.propertyIds.includes(r.property_id)))
    .map((r: any) => ({
      source: "property_media" as const,
      contentId: `media_asset:${r.id}`,
      brandId: r.brand_id,
      channels: [input.channel],
      media: r.media_type === "video"
        ? { videoUrl: r.public_url ?? undefined, mediaType: "video" as const, aspectRatio: r.aspect_ratio ?? undefined }
        : { imageUrl: r.public_url ?? undefined, mediaType: "image" as const, aspectRatio: r.aspect_ratio ?? undefined },
      humanApproved: !!r.is_favorite || !!r.exported_to_content_hub_at,
      propertyIds: r.property_id ? [r.property_id] : [],
      createdAt: r.created_at ?? null,
      factCheckedAt: r.created_at ?? null,
    }));
}

async function verifiedCampaignIds(supabase: MarketingSupabaseLike, brandId: string, campaignIds: string[]): Promise<string[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("id,brand_id")
    .in("id", campaignIds)
    .eq("brand_id", brandId);
  if (error) return [];
  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean);
}

async function searchAdCreatives(supabase: MarketingSupabaseLike, input: ResolverInput, campaignIds: string[]): Promise<ContentCandidate[]> {
  const ownedCampaignIds = await verifiedCampaignIds(supabase, input.brandId, campaignIds);
  if (!ownedCampaignIds.length) return [];
  const { data } = await supabase
    .from("ad_creatives")
    .select("id, campaign_id, aspect_ratio, image_url, caption_primary, hashtags, status, is_top_pick, created_at")
    .in("campaign_id", ownedCampaignIds)
    .eq("status", "completed")
    .limit(50);
  return (data ?? [])
    .filter((r: any) => !!r.image_url && ownedCampaignIds.includes(String(r.campaign_id)))
    .map((r: any) => ({
      source: "ad_creative" as const,
      contentId: `ad_creative:${r.id}`,
      brandId: input.brandId,
      channels: [input.channel],
      text: r.caption_primary ?? "",
      media: { imageUrl: r.image_url, mediaType: "image" as const, aspectRatio: r.aspect_ratio ?? undefined },
      humanApproved: !!r.is_top_pick,
      createdAt: r.created_at ?? null,
      factCheckedAt: r.created_at ?? null,
    }));
}

export async function resolveMarketingContent(
  supabase: MarketingSupabaseLike,
  input: ResolverInput,
  sources: ResolverSourceMap = {},
): Promise<ResolveDecision> {
  const candidates: ContentCandidate[] = [];
  if (sources.organizationId) candidates.push(...(await searchContentHub(supabase, input, sources.organizationId).catch(() => [])));
  candidates.push(...(await searchMedia(supabase, input).catch(() => [])));
  if (sources.adCampaignIds?.length) candidates.push(...(await searchAdCreatives(supabase, input, sources.adCampaignIds).catch(() => [])));
  return resolveContent(candidates, input);
}
