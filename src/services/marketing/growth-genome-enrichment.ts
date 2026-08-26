import type { MarketingSupabaseLike } from "@/services/marketing/adapters";
import type { ContentGenome } from "@/lib/marketing/genome";

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function publishedLocalParts(iso: string, timeZone = "Europe/Madrid") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const weekday = parts.find((p) => p.type === "weekday")?.value?.toLowerCase();
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? NaN);
  if (!weekday || !Number.isFinite(hour)) return null;
  const daypart = hour >= 6 && hour <= 10
    ? "morning"
    : hour <= 14
      ? "midday"
      : hour <= 18
        ? "afternoon"
        : hour <= 23
          ? "evening"
          : "night";
  return {
    publishHour: `h_${String(hour).padStart(2, "0")}`,
    publishWeekday: WEEKDAYS.includes(weekday as any) ? weekday : "unknown",
    publishDaypart: daypart,
  };
}

function headlineSignals(headline: string | null | undefined) {
  const value = String(headline ?? "").trim();
  if (!value) return {};
  const headlineLengthBand = value.length <= 45 ? "short" : value.length <= 90 ? "medium" : "long";
  const headlineShape = value.includes("?")
    ? "question"
    : /(?:€|eur|\b\d{3,}\b)/i.test(value)
      ? "number_or_price"
      : /^\d+\b/.test(value)
        ? "list"
        : /!$/.test(value)
          ? "exclamation"
          : "statement";
  return { headlineLengthBand, headlineShape };
}

function imageClass(media: any): string | undefined {
  const mediaType = String(media?.mediaType ?? "").toLowerCase();
  if (mediaType.includes("video") || mediaType.includes("reel")) return "video";
  const haystack = [media?.altText, media?.imageUrl, media?.linkUrl]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const patterns: Array<[RegExp, string]> = [
    [/pool|piscina|swimming/, "pool"],
    [/terrace|terraza|balcony|balcon/, "terrace"],
    [/kitchen|cocina/, "kitchen"],
    [/bedroom|dormitorio/, "bedroom"],
    [/bathroom|baño|bano/, "bathroom"],
    [/living|salon|lounge/, "living_room"],
    [/sea|ocean|view|vista|mountain/, "view"],
    [/garden|jardin/, "garden"],
    [/facade|exterior|villa|house|front/, "exterior"],
    [/floorplan|plano|plan_/, "floorplan"],
  ];
  for (const [pattern, value] of patterns) if (pattern.test(haystack)) return value;
  if (media?.imageUrl) return "inventory_primary_image";
  return undefined;
}

function extractTags(text: string): string[] {
  return Array.from(new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? [])
    .map((tag) => tag.slice(1).toLowerCase())
    .filter(Boolean))).slice(0, 30);
}

export async function enrichPublishedGrowthGenomes(
  supabase: MarketingSupabaseLike,
  opts: { brandId: string; channel?: string; days?: number; timeZone?: string },
): Promise<{ candidates: number; enriched: number }> {
  const since = new Date(Date.now() - Math.max(1, opts.days ?? 60) * 86_400_000).toISOString();
  let q = supabase
    .from("marketing_publications")
    .select("publication_id,content_id,brand_id,channel,state,updated_at")
    .eq("brand_id", opts.brandId)
    .eq("state", "published")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(250);
  if (opts.channel) q = q.eq("channel", opts.channel);
  const { data: publications, error } = await q;
  if (error) throw new Error(`GROWTH_GENOME_PUBLICATIONS_FAILED: ${error.message}`);

  let enriched = 0;
  for (const pub of publications ?? []) {
    const contentId = String(pub.content_id ?? "");
    const publicationId = String(pub.publication_id ?? "");
    if (!contentId || !publicationId) continue;

    const [{ data: attempt }, { data: asset }] = await Promise.all([
      supabase
        .from("marketing_publish_attempts")
        .select("updated_at,status")
        .eq("publication_id", publicationId)
        .eq("status", "posted")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("marketing_assets")
        .select("creative_variant_id,genome,headline,body,cta,media,updated_at")
        .eq("content_id", contentId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (!asset?.genome) continue;

    const postedAt = attempt?.updated_at || pub.updated_at;
    const timing = postedAt ? publishedLocalParts(String(postedAt), opts.timeZone ?? "Europe/Madrid") : null;
    const caption = [asset.headline, asset.body, asset.cta].filter(Boolean).join("\n");
    const tags = extractTags(caption);
    const genome: ContentGenome = {
      ...(asset.genome as ContentGenome),
      ...(timing ?? {}),
      ...headlineSignals(asset.headline),
      ...(imageClass(asset.media) ? { imageClass: imageClass(asset.media) } : {}),
      ...(tags.length ? { tags } : {}),
    };

    const { error: assetError } = await supabase
      .from("marketing_assets")
      .update({ genome, updated_at: new Date().toISOString() })
      .eq("creative_variant_id", asset.creative_variant_id);
    if (assetError) throw new Error(`GROWTH_GENOME_ASSET_UPDATE_FAILED: ${assetError.message}`);

    const { error: contentError } = await supabase
      .from("marketing_content")
      .update({ genome, channel: String(pub.channel), updated_at: new Date().toISOString() })
      .eq("content_id", contentId)
      .eq("brand_id", opts.brandId);
    if (contentError) throw new Error(`GROWTH_GENOME_CONTENT_UPDATE_FAILED: ${contentError.message}`);
    enriched++;
  }

  return { candidates: publications?.length ?? 0, enriched };
}
