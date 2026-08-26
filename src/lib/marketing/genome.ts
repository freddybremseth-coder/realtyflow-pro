/**
 * Marketing Growth OS — Content Genome (Phase 2).
 *
 * Hvert publisert innhold får strukturert metadata slik at systemet kan LÆRE:
 * ikke bare «Post A fikk 10 000 views», men «norske villa-Reels med price-first-
 * hook i Finestrat gir 46 % flere kvalifiserte leads». De klassifiserbare
 * dimensjonene (kanal/format/hook/CTA/mål) er enum-kontrollert; resten er fri
 * tekst normalisert til lowercase-slug for konsistent aggregering.
 */

import { z } from "zod";

export const MARKETING_CHANNELS = [
  "instagram", "facebook", "linkedin", "youtube", "youtube_shorts", "tiktok", "website", "email",
] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const CONTENT_FORMATS = [
  "reel", "short", "video", "image", "carousel", "story", "article", "post", "email", "landing_page", "lead_magnet",
] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const HOOK_TYPES = [
  "price_first", "lifestyle_first", "education", "question", "story", "listing", "testimonial", "market_insight", "other",
] as const;
export type HookType = (typeof HOOK_TYPES)[number];

export const CTA_TYPES = [
  "property_guide", "book_viewing", "contact", "download", "subscribe", "learn_more", "dm", "none",
] as const;
export type CtaType = (typeof CTA_TYPES)[number];

export const CONTENT_GOALS = [
  "lead_generation", "awareness", "engagement", "nurture", "booking", "sale", "seo_traffic", "b2b",
] as const;
export type ContentGoal = (typeof CONTENT_GOALS)[number];

/** Fritekst-slug: trimmet, lowercase, mellomrom→_. For area/topic/audience osv. */
export const slug = z.string().trim().min(1).max(80).transform((v) => v.toLowerCase().replace(/\s+/g, "_"));

/** Hashtag uten #, lowercase, deduplisert. */
const tagSlug = z.string().trim().min(1).max(80).transform((v) => v.replace(/^#+/, "").toLowerCase());

export const ContentGenomeSchema = z.object({
  brandId: z.string().trim().min(1),
  channel: z.enum(MARKETING_CHANNELS),
  format: z.enum(CONTENT_FORMATS),
  // Klassifiserbare læringsdimensjoner
  hookType: z.enum(HOOK_TYPES).optional(),
  ctaType: z.enum(CTA_TYPES).optional(),
  goal: z.enum(CONTENT_GOALS).optional(),
  // Fritekst-dimensjoner (normalisert)
  contentPillar: slug.optional(),
  topic: slug.optional(),
  area: slug.optional(),
  language: z.string().trim().toLowerCase().min(2).max(5).optional(),
  audience: slug.optional(),
  propertyType: slug.optional(),
  priceBand: slug.optional(),
  creativeStyle: slug.optional(),
  campaign: slug.optional(),
  /** Faktiske publiseringsforhold, backfilles fra posted-at i metrics enrichment. */
  publishHour: slug.optional(),
  publishWeekday: slug.optional(),
  publishDaypart: slug.optional(),
  /** Faktisk headline-form og medieklasse, ikke bare planlagt hook/format. */
  headlineLengthBand: slug.optional(),
  headlineShape: slug.optional(),
  imageClass: slug.optional(),
  /** Faktiske hashtags som ble publisert. Learning Engine lærer per enkelt tag. */
  tags: z.array(tagSlug).max(30).transform((values) => Array.from(new Set(values))).optional(),
  // Koblinger + proveniens
  propertyId: z.string().trim().optional(),
  agentVersion: z.string().trim().optional(),
  promptVersion: z.string().trim().optional(),
});
export type ContentGenome = z.infer<typeof ContentGenomeSchema>;

export function parseGenome(input: unknown): { ok: true; genome: ContentGenome } | { ok: false; error: string } {
  const r = ContentGenomeSchema.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, genome: r.data };
}

/** Stabil signatur av de læringsbærende dimensjonene — grupperingsnøkkel for
 *  «hvilken kombinasjon virker». Tags analyseres separat per tag og inngår ikke
 *  i signaturen, ellers ville små variasjoner i hashtag-sett fragmentert data. */
export function genomeSignature(g: ContentGenome): string {
  return [g.channel, g.format, g.hookType ?? "?", g.propertyType ?? "?", g.language ?? "?", g.area ?? "?"].join("|");
}
