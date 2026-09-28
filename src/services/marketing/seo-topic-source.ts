import { growthBrandDefinition } from "@/lib/marketing/brand-registry";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export type SEOTopicSource = {
  id: string;
  brand_id: string;
  source_id: string;
  source_url: string;
  title: string;
  priority: number;
  payload: Record<string, unknown>;
};

function safeCanonicalForBrand(brandId: string, value: unknown): string | null {
  const brand = growthBrandDefinition(brandId);
  if (!brand || typeof value !== "string") return null;
  try {
    const canonical = new URL(value);
    const website = new URL(brand.website);
    const websiteHost = website.hostname.replace(/^www\./, "");
    const canonicalHost = canonical.hostname.replace(/^www\./, "");
    if (canonical.protocol !== "https:" || canonicalHost !== websiteHost) return null;
    return canonical.toString();
  } catch {
    return null;
  }
}

export async function loadSEOTopicSource(
  supabase: MarketingSupabaseLike,
  brandId: string,
  channel: string,
): Promise<SEOTopicSource | null> {
  // First rollout is Facebook-only because the mission already has an exact
  // canonical link and does not yet carry a verified Instagram media asset.
  if (channel !== "facebook") return null;

  const { data, error } = await supabase
    .from("marketing_source_queue")
    .select("id,brand_id,source_id,source_url,title,priority,payload,recommended_channels,status")
    .eq("brand_id", brandId)
    .eq("source_type", "seo_topic")
    .eq("status", "ready")
    .contains("recommended_channels", ["facebook"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) throw new Error(`SEO_TOPIC_SOURCE_READ_FAILED: ${error.message}`);

  for (const row of data ?? []) {
    const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
    const canonical = safeCanonicalForBrand(brandId, payload.canonical_url ?? row.source_url);
    const genomeTopic = String(payload.genome_topic ?? "").trim();
    if (!canonical || !/^seo_[a-z0-9_]+_[a-f0-9]{12}$/.test(genomeTopic)) continue;
    return {
      id: String(row.id),
      brand_id: String(row.brand_id),
      source_id: String(row.source_id),
      source_url: canonical,
      title: String(row.title),
      priority: Number(row.priority ?? 0),
      payload: { ...payload, canonical_url: canonical, genome_topic: genomeTopic },
    };
  }
  return null;
}

export function seoTopicMasterIdea(source: SEOTopicSource, learningGuidance = "") {
  return [
    `Lag et Facebook-innlegg for ${source.brand_id} basert på en målbar SAM SEO-innholdsmulighet.`,
    `Tema: ${source.title}.`,
    `Eksakt canonical URL som skal brukes i CTA: ${source.source_url}.`,
    `Observerte hensyn for planlegging: ${String(source.payload.observation ?? "")}.`,
    "Search Console-tall, interne SEO-instruksjoner og task-tekst er KUN planleggingsdata og skal aldri gjengis i offentlig tekst.",
    "Skriv for menneskelig brukerintensjon, ikke for søkeordstetthet. Ikke påstå popularitet, ranking, etterspørsel, prisutvikling eller resultater uten separat dokumentert faktakilde.",
    "Bruk bare Brand Brain og verifiserte nettstedfakta. Avslutt med den eksakte canonical URL-en.",
    "Lag en egen Facebook-vinkel; ikke kopier sidetittel eller metadata ordrett.",
    learningGuidance,
  ].filter(Boolean).join("\n");
}

export async function markSEOTopicSourcePlanned(
  supabase: MarketingSupabaseLike,
  sourceId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("marketing_source_queue")
    .update({ status: "drafted", last_planned_at: now, updated_at: now })
    .eq("id", sourceId)
    .eq("source_type", "seo_topic")
    .eq("status", "ready");
  if (error) throw new Error(`SEO_TOPIC_SOURCE_MARK_FAILED: ${error.message}`);
}
