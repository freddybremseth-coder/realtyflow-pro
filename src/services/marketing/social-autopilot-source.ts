import { growthBrandDefinition } from "@/lib/marketing/brand-registry";
import { resolveWebsiteCmsConfig } from "@/lib/website-cms";
import {
  buildSocialStrategySnapshot,
  inferSocialCategory,
  socialCategoryForSource,
  type SocialCategory,
} from "@/lib/workspaces/social-strategy";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export type AutopilotEditorialSource = {
  sourceType: "website_content" | "area";
  sourceId: string;
  sourceUrl: string;
  title: string;
  kind: "guide" | "magazine" | "article" | "area";
  socialCategory: SocialCategory;
  facts: Array<{ claim: string; source: string }>;
  imageUrls: string[];
  contentId: string | null;
  areaId: string | null;
};

function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : [];
}

function tagValue(value: string[], prefix: string) {
  return value.find((item) => item.startsWith(prefix))?.slice(prefix.length) || "";
}

function clean(value: unknown, max = 5_000) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function httpsImages(...values: unknown[]) {
  const out: string[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "string" && /^https:\/\//i.test(value) && !out.includes(value)) out.push(value);
    if (Array.isArray(value)) value.forEach(visit);
  };
  values.forEach(visit);
  return out.slice(0, 10);
}

function cmsUrl(website: string, path: string, slug: string) {
  try {
    const base = new URL(website);
    const root = path.startsWith("/") ? path : "/" + path;
    base.pathname = (root.replace(/\/$/, "") + "/" + encodeURIComponent(slug)).replace(/\/+/g, "/");
    base.search = "";
    base.hash = "";
    return base.toString();
  } catch {
    return website;
  }
}

function kindFor(contentType: string, destinationType: string | undefined): "guide" | "magazine" | "article" {
  const value = (destinationType || contentType || "").toLowerCase();
  if (value.includes("guide")) return "guide";
  if (value.includes("magazine") || value.includes("magasin")) return "magazine";
  return "article";
}

async function recentUsedSourceIds(
  supabase: MarketingSupabaseLike,
  brandId: string,
  channel: string,
  cooldownDays: number,
) {
  const since = new Date(Date.now() - cooldownDays * 86_400_000).toISOString();
  const { data, error } = await supabase.from("marketing_publications")
    .select("source_id")
    .eq("brand_id", brandId)
    .eq("channel", channel)
    .in("state", ["draft", "approved", "publishing", "published", "scheduled"])
    .gte("created_at", since)
    .limit(500);
  if (error) throw new Error("SOCIAL_AUTOPILOT_SOURCE_HISTORY_FAILED: " + error.message);
  return new Set((data || []).map((row: any) => String(row.source_id || "")).filter(Boolean));
}

async function recentSocialMix(supabase: MarketingSupabaseLike, brandId: string, channel: string) {
  const { data, error } = await supabase.from("content_publications")
    .select("title,description,tags,content_features,published_at,created_at,scheduled_platforms")
    .eq("brand_id", brandId)
    .eq("status", "published")
    .contains("scheduled_platforms", [channel])
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return data || [];
}

export async function loadAutopilotEditorialSource(
  supabase: MarketingSupabaseLike,
  input: {
    brandId: string;
    channel: "instagram" | "facebook";
    preferredCategory?: SocialCategory | null;
    cooldownDays?: number;
  },
): Promise<{ source: AutopilotEditorialSource | null; recommendedCategory: SocialCategory | null; strategyReason: string | null }> {
  const definition = growthBrandDefinition(input.brandId);
  if (!definition?.website) return { source: null, recommendedCategory: null, strategyReason: null };

  const cooldownDays = Math.max(3, Math.min(30, input.cooldownDays ?? 14));
  const [settingsR, websiteR, areasR, usedIds, recentMix] = await Promise.all([
    supabase.from("brand_settings").select("settings").eq("brand_id", input.brandId).maybeSingle(),
    supabase.from("content_publications")
      .select("id,title,description,ai_description,tags,media_urls,ai_image_url,content_type,published_at,created_at,updated_at")
      .eq("brand_id", input.brandId)
      .eq("status", "published")
      .like("content_type", "website_%")
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.from("area_profiles")
      .select("id,name,slug,hero_blurb,description,highlights,lifestyle,climate,photo_url,updated_at")
      .eq("brand_id", input.brandId)
      .eq("show_on_website", true)
      .order("updated_at", { ascending: false })
      .limit(100),
    recentUsedSourceIds(supabase, input.brandId, input.channel, cooldownDays),
    recentSocialMix(supabase, input.brandId, input.channel),
  ]);

  if (websiteR.error) throw new Error("SOCIAL_AUTOPILOT_EDITORIAL_READ_FAILED: " + websiteR.error.message);

  const config = resolveWebsiteCmsConfig(
    input.brandId,
    (settingsR.data?.settings || {}) as Record<string, unknown>,
    definition.website,
  );

  const strategy = definition.kind === "real_estate"
    ? buildSocialStrategySnapshot(recentMix as any[], input.brandId)
    : null;
  const recommendedCategory = input.preferredCategory ?? strategy?.recommendedCategory ?? null;
  const candidates: AutopilotEditorialSource[] = [];

  for (const row of websiteR.data || []) {
    const rowTags = tags(row.tags);
    const destinationId = tagValue(rowTags, "cms:");
    const slug = tagValue(rowTags, "slug:");
    const destination = config.destinations.find((item) => item.id === destinationId);
    if (!slug || !destination) continue;
    const kind = kindFor(String(row.content_type || ""), destination.contentType);
    const sourceUrl = cmsUrl(config.website || definition.website, destination.path, slug);
    const summary = clean(row.ai_description, 1_000);
    const body = clean(row.description, 4_000);
    const title = clean(row.title, 220) || slug;
    const sourceId = "website:" + row.id;
    if (usedIds.has(sourceId)) continue;
    const inferredCategory = inferSocialCategory({
      title,
      description: [summary, body].filter(Boolean).join(" "),
      tags: rowTags,
    });
    const socialCategory = inferredCategory === "unknown"
      ? socialCategoryForSource({ sourceType: "article", contentKind: kind })
      : inferredCategory;

    candidates.push({
      sourceType: "website_content",
      sourceId,
      sourceUrl,
      title,
      kind,
      socialCategory,
      facts: [
        { claim: "Kildetittel: " + title, source: sourceUrl },
        ...(summary ? [{ claim: "Kildesammendrag: " + summary, source: sourceUrl }] : []),
        ...(body ? [{ claim: "Kildeinnhold: " + body, source: sourceUrl }] : []),
      ],
      imageUrls: httpsImages(row.media_urls, row.ai_image_url),
      contentId: String(row.id),
      areaId: null,
    });
  }

  if (!areasR.error) {
    for (const row of areasR.data || []) {
      const sourceId = "area:" + row.id;
      if (usedIds.has(sourceId)) continue;
      const title = clean(row.name, 180);
      if (!title) continue;
      const body = clean(row.description || row.hero_blurb || row.lifestyle, 3_000);
      const highlights = Array.isArray(row.highlights) ? row.highlights.map((item: unknown) => clean(item, 300)).filter(Boolean).join("; ") : "";
      candidates.push({
        sourceType: "area",
        sourceId,
        sourceUrl: config.website || definition.website,
        title,
        kind: "area",
        socialCategory: "area_lifestyle",
        facts: [
          { claim: "Område: " + title, source: config.website || definition.website },
          ...(body ? [{ claim: "Områdeprofil: " + body, source: config.website || definition.website }] : []),
          ...(highlights ? [{ claim: "Dokumenterte høydepunkter: " + highlights, source: config.website || definition.website }] : []),
          ...(clean(row.climate, 500) ? [{ claim: "Klimaopplysning fra områdeprofil: " + clean(row.climate, 500), source: config.website || definition.website }] : []),
        ],
        imageUrls: httpsImages(row.photo_url),
        contentId: null,
        areaId: String(row.id),
      });
    }
  }

  const categoryOrder: SocialCategory[] = recommendedCategory
    ? [recommendedCategory, "area_lifestyle", "guide_competence", "market_insight", "proof_process", "people_advisor"]
    : ["guide_competence", "market_insight", "area_lifestyle", "proof_process", "people_advisor"];
  const uniqueOrder = Array.from(new Set(categoryOrder));

  let source: AutopilotEditorialSource | null = null;
  for (const category of uniqueOrder) {
    const eligible = candidates.filter((item) => item.socialCategory === category);
    if (!eligible.length) continue;
    source = eligible[0];
    break;
  }
  source ??= candidates[0] ?? null;

  return {
    source,
    recommendedCategory,
    strategyReason: strategy?.recommendationReason ?? null,
  };
}


export function autopilotEditorialMasterIdea(
  source: AutopilotEditorialSource,
  input: { conceptLabel: string; channel: "instagram" | "facebook"; learningGuidance?: string },
) {
  const channelRule = input.channel === "instagram"
    ? "Instagram: ikke skriv URL, 'lenke i bio' eller en uklickbar nettadresse i captionen. Bruk en naturlig lagre-, dele- eller DM-CTA."
    : "Facebook: bruk den verifiserte kildelenken når det er naturlig og gjør innlegget klikkbart.";
  return [
    `Lag et ${input.conceptLabel}-innlegg for ${source.title}.`,
    `Kildetype: ${source.kind}. Sosial kategori: ${source.socialCategory}.`,
    `Verifisert kilde: ${source.sourceUrl}.`,
    "Bruk bare fakta som følger med som factSources. Ikke utled markedstrender, priser, popularitet, juridiske forhold eller resultater som ikke står i kilden.",
    "Skriv kanalnative copy, ikke en kopi av artikkelens tittel/metatekst.",
    channelRule,
    input.learningGuidance || "",
  ].filter(Boolean).join("\n");
}
