/**
 * Phase 7.1C — MarketingContentResolver-adapter. Søker i EKSISTERENDE systemer
 * (Content Hub via social_posts, Media/Image Studio via media_assets, Ad Builder
 * via ad_creatives) før noe nytt genereres. Ingen parallelle content-tabeller.
 *
 * Brand-isolasjon håndheves i flere lag: org- og media-kilder er eksplisitt
 * brand-scopet, ad campaigns valideres mot ad_campaigns.brand_id før creatives
 * kan gjenbrukes, og resolver-kjernen diskvalifiserer kandidater med feil brand.
 * Ved uklar mapping genereres nytt i stedet for å fuzzy-matche på tvers av brands.
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
  /** social_posts.organization_id som tilhører dette brandet (eksplisitt). */
  organizationId?: string | null;
  /** Kandidat-campaigns. Eierskap valideres alltid mot ad_campaigns før bruk. */
  adCampaignIds?: string[] | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function latestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

/**
 * Reell gjenbrukshistorikk kommer fra publiseringsledgeren, ikke fra assetets
 * opprettelsesdato. Dette gjør fatigue/cooldown kildebevisst for både Content
 * Hub, Media Studio og Ad Builder.
 */
async function attachPublicationUsage(
  supabase: MarketingSupabaseLike,
  input: ResolverInput,
  candidates: ContentCandidate[],
): Promise<ContentCandidate[]> {
  const sourceIds = Array.from(new Set(candidates.map((candidate) => candidate.contentId).filter(Boolean)));
  if (!sourceIds.length) return candidates;
  const { data, error } = await supabase
    .from("marketing_publications")
    .select("source_id,created_at,updated_at,state")
    .eq("brand_id", input.brandId)
    .eq("channel", input.channel)
    .in("source_id", sourceIds)
    .in("state", ["published", "scheduled"])
    .limit(5000);
  if (error) throw new Error(`CONTENT_USAGE_HISTORY_FAILED: ${error.message}`);

  const usage = new Map<string, { count: number; lastUsedAt: string | null }>();
  for (const row of data ?? []) {
    const sourceId = String((row as any).source_id ?? "");
    if (!sourceId) continue;
    const current = usage.get(sourceId) ?? { count: 0, lastUsedAt: null };
    const usedAt = (row as any).created_at ?? (row as any).updated_at ?? null;
    usage.set(sourceId, { count: current.count + 1, lastUsedAt: latestIso(current.lastUsedAt, usedAt) });
  }

  return candidates.map((candidate) => {
    const found = usage.get(candidate.contentId);
    if (!found) return candidate;
    return {
      ...candidate,
      usageCount: Math.max(candidate.usageCount ?? 0, found.count),
      lastUsedAt: latestIso(candidate.lastUsedAt, found.lastUsedAt),
    };
  });
}

/** Content Hub (social_posts) — godkjent = høyere tillit; draft/review = gjenbrukbart studio-asset. */
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

/** Property/Media-assets (media_assets) — brand + property-scopet. */
async function searchMedia(supabase: MarketingSupabaseLike, input: ResolverInput): Promise<ContentCandidate[]> {
  const { data } = await supabase
    .from("media_assets")
    .select("id, brand_id, property_id, media_type, public_url, thumbnail_url, aspect_ratio, status, is_favorite, exported_to_content_hub_at, ai_generated, metadata_json, tags, created_at")
    .eq("brand_id", input.brandId)
    .eq("status", "active")
    .in("media_type", ["image", "video"])
    .limit(50);
  return (data ?? [])
    .filter((r: any) => !input.propertyIds?.length || (r.property_id && input.propertyIds.includes(r.property_id)))
    .map((r: any) => {
      const autopilotGenerated = r.ai_generated === true
        && r.metadata_json?.actorEmail === "nexus-marketing-autopilot@system.local";
      return {
        source: autopilotGenerated ? "generated" as const : "property_media" as const,
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
      };
    });
}

async function verifiedCampaignIds(
  supabase: MarketingSupabaseLike,
  brandId: string,
  campaignIds: string[],
): Promise<string[]> {
  if (!campaignIds.length) return [];
  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("id,brand_id")
    .in("id", campaignIds)
    .eq("brand_id", brandId);
  if (error) return [];
  return (data ?? []).map((row: any) => String(row.id)).filter(Boolean);
}

/** Ad Builder-creatives — only from campaigns whose brand ownership is verified. */
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

/** Hovedinngang: samle kandidater fra alle eksisterende kilder + beslutt gjenbruk vs generér. */
export async function resolveMarketingContent(
  supabase: MarketingSupabaseLike,
  input: ResolverInput,
  sources: ResolverSourceMap = {},
): Promise<ResolveDecision> {
  const candidates: ContentCandidate[] = [];
  if (sources.organizationId) candidates.push(...(await searchContentHub(supabase, input, sources.organizationId).catch(() => [])));
  candidates.push(...(await searchMedia(supabase, input).catch(() => [])));
  if (sources.adCampaignIds?.length) candidates.push(...(await searchAdCreatives(supabase, input, sources.adCampaignIds).catch(() => [])));
  let rankedCandidates = candidates;
  try {
    rankedCandidates = await attachPublicationUsage(supabase, input, candidates);
  } catch (error) {
    if (input.minimumReuseIntervalDays != null) throw error;
  }
  return resolveContent(rankedCandidates, input);
}
