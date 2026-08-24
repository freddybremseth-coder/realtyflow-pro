/**
 * Phase 7.1G — LEGACY Content Hub kompatibilitets-adapter.
 *
 * Produksjonsrealitet: social_posts = 0 rader, content_publications = 600 (den
 * faktiske Content Hub i bruk). Denne adapteren lar Marketing Growth OS EKSPLISITT
 * gjenbruke ÉN publiserbar legacy content_publications-rad som kilde — uten å
 * fabrikkere content_hub_org_id eller kopiere data.
 *
 * KUN eksplisitt valgt publication-ID (ingen fuzzy, ingen AI-regenerering).
 * Fail closed med eksplisitt kode: brand/plattform/status/publishability/media.
 * Dette er et KOMPATIBILITETSLAG, ikke et nytt content-system.
 */

import { contentPublishabilityGate, type ContentCandidate } from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/** Menneske-tiltrodde statuser for gjenbruk (aldri failed/draft-meta-tekst). */
const TRUSTED_STATUSES = ["published", "scheduled", "approved", "review"];

const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);

export interface LegacyCandidateInput {
  publicationId: string;
  brandId: string;
  channel: string;
  /** Overstyr/utfyll media-URL (public HTTPS) hvis raden mangler den. */
  mediaUrl?: string;
}

/**
 * Last ÉN eksplisitt content_publications-rad som ContentCandidate. Kaster med
 * eksplisitt kode hvis noen forutsetning svikter — publiserer/gjenbruker aldri
 * på gjett.
 */
export async function loadLegacyPublicationCandidate(
  supabase: MarketingSupabaseLike,
  input: LegacyCandidateInput,
): Promise<ContentCandidate> {
  const { data: row } = await supabase.from("content_publications").select("*").eq("id", input.publicationId).maybeSingle();
  if (!row) throw new Error(`LEGACY_PUBLICATION_NOT_FOUND: ${input.publicationId}`);

  // Brand må matche (P0-isolasjon — aldri på tvers av brands).
  if (!row.brand_id || row.brand_id !== input.brandId) {
    throw new Error(`BRAND_MISMATCH: publication tilhører «${row.brand_id}», ikke «${input.brandId}».`);
  }

  // Plattform må matche (kanal). Eksplisitt platform-felt eller scheduled_platforms.
  const platformField: string | null = typeof row.platform === "string" ? row.platform : null;
  const scheduled: string[] = Array.isArray(row.scheduled_platforms) ? row.scheduled_platforms.map(String) : [];
  if (platformField && platformField !== input.channel) throw new Error(`PLATFORM_MISMATCH: raden er «${platformField}», ikke «${input.channel}».`);
  if (!platformField && scheduled.length > 0 && !scheduled.includes(input.channel)) {
    throw new Error(`PLATFORM_MISMATCH: raden er planlagt for ${scheduled.join(", ")}, ikke «${input.channel}».`);
  }

  // Status må være menneske-tiltrodd (ikke failed/draft-meta-tekst).
  if (!TRUSTED_STATUSES.includes(String(row.status))) {
    throw new Error(`UNTRUSTED_STATUS: status «${row.status}» er ikke en tiltrodd, publiserbar tilstand.`);
  }

  // Body (kanonisk = description) må passere publishability-gaten.
  const body = String(row.description ?? row.content ?? row.body ?? row.caption ?? "").trim();
  const pub = contentPublishabilityGate(body);
  if (!pub.publishable) throw new Error(`NOT_PUBLISHABLE: ${pub.result} — ${pub.reason}`);

  // Media (kanonisk = ai_image_url). Instagram krever gyldig public HTTPS-URL.
  const mediaUrl = [input.mediaUrl, row.ai_image_url, row.image_url, ...(Array.isArray(row.media_urls) ? row.media_urls : [])].find(isHttps);
  if (input.channel === "instagram" && !mediaUrl) {
    throw new Error("MEDIA_ASSET_MISSING: Instagram krever gyldig public HTTPS media-URL (ai_image_url mangler).");
  }

  const humanApproved = ["published", "approved"].includes(String(row.status));
  return {
    source: "legacy_content_publication",
    contentId: `content_publication:${row.id}`,
    brandId: row.brand_id,
    channels: [input.channel],
    text: body,
    media: mediaUrl ? { imageUrl: mediaUrl, mediaType: "image" } : null,
    status: String(row.status),
    humanApproved,
    propertyIds: [],
    createdAt: row.created_at ?? null,
    factCheckedAt: row.updated_at ?? row.created_at ?? null,
  };
}
