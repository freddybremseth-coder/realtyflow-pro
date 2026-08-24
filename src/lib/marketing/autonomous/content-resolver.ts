/**
 * Phase 7.1C — Unified Content Resolver (ren logikk).
 *
 * Marketing Growth OS skal BRUKE hele det eksisterende produksjonsapparatet
 * (Content Hub / Content Studio / Image Studio / Media Studio / Ad Builder /
 * Property Media) før den genererer noe nytt. Denne kjernen rangerer kandidater
 * fra alle kildene og velger beste gjenbruk — eller beslutter å generere nytt
 * kun når nødvendig.
 *
 * P0 = MULTI-BRAND ISOLATION. Aldri fuzzy-match på tvers av brands. Hvert asset
 * må ha eksplisitt brand. Feil brand → BRAND_MISMATCH (fail closed). En perfekt
 * post på feil konto er verre enn ingen post.
 */

import type { ContentFormat, ContentGenome, ContentGoal, MarketingChannel } from "../genome";

export const CONTENT_SOURCES = ["content_hub_approved", "studio_reusable", "ad_creative", "property_media", "generated"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

/** Kilde-prioritet: godkjent Content Hub > gjenbrukbart studio/ad-asset > property-media > generér nytt. */
export const SOURCE_PRIORITY: Record<ContentSource, number> = {
  content_hub_approved: 5,
  studio_reusable: 4,
  ad_creative: 3,
  property_media: 2,
  generated: 0,
};

export const REUSE_MODES = ["reuse_exact", "adapt_copy", "adapt_channel", "adapt_language", "refresh_facts", "regenerate_visual", "derive_variant"] as const;
export type ReuseMode = (typeof REUSE_MODES)[number];

export interface ResolverInput {
  brandId: string;
  channel: MarketingChannel;
  goal?: ContentGoal;
  campaignRelevance?: string;
  audience?: string;
  language?: string;
  area?: string;
  propertyIds?: string[];
  format?: ContentFormat;
  service?: string;
  now?: string | Date;
  /** Maks alder (dager) før fakta må re-verifiseres (default 45). */
  maxFactAgeDays?: number;
  /** Likhet/fatigue-vindu (dager) for nylig gjenbruk (default 14). */
  recentReuseDays?: number;
}

export interface AssetMedia {
  imageUrl?: string;
  videoUrl?: string;
  mediaType?: "image" | "video" | "reel";
  aspectRatio?: string;
  altText?: string;
}

export interface ContentCandidate {
  source: ContentSource;
  contentId: string;
  brandId: string;
  accountId?: string | null;
  service?: string | null;
  /** Kanaler assetet er egnet/godkjent for. */
  channels: string[];
  language?: string | null;
  text?: string;
  media?: AssetMedia | null;
  status?: string | null;
  humanApproved: boolean;
  genome?: Partial<ContentGenome>;
  propertyIds?: string[];
  factSources?: Array<{ claim: string; source: string }>;
  factCheckedAt?: string | null;
  createdAt?: string | null;
  lastUsedAt?: string | null;
  usageCount?: number;
  // Ytelse (fra attribution/learning-tilbakeføring):
  businessValue?: number;
  experimentBacked?: boolean;
}

export interface ScoredCandidate extends ContentCandidate {
  score: number;
  disqualified?: string;
  reuseMode: ReuseMode;
  /** Ny godkjenning nødvendig (f.eks. utdaterte fakta eller kanal-adaptasjon). */
  needsReapproval: boolean;
  breakdown: Record<string, number>;
}

const dayMs = 86_400_000;
const daysBetween = (a: string | Date, b: string | Date) => Math.max(0, (new Date(a).getTime() - new Date(b).getTime()) / dayMs);

/** P0: eksplisitt brand-match. Kaster ved mismatch — aldri publiser feil brand. */
export function assertBrandMatch(candidate: Pick<ContentCandidate, "brandId">, input: Pick<ResolverInput, "brandId">): void {
  if (!candidate.brandId || candidate.brandId !== input.brandId) {
    throw new Error(`BRAND_MISMATCH: asset-brand «${candidate.brandId}» ≠ kampanje-brand «${input.brandId}» — publiserer aldri på tvers av brands.`);
  }
}

export function channelSuitable(candidate: Pick<ContentCandidate, "channels">, channel: string): boolean {
  return candidate.channels.map((c) => c.toLowerCase()).includes(channel.toLowerCase());
}

/** Utdaterte fakta = har fakta-påstander som ikke er verifisert innen maxFactAgeDays, eller property-relatert uten fersk sjekk. */
export function isFactStale(candidate: ContentCandidate, input: ResolverInput): boolean {
  const max = input.maxFactAgeDays ?? 45;
  const now = input.now ?? new Date();
  const hasFacts = (candidate.factSources?.length ?? 0) > 0 || (candidate.propertyIds?.length ?? 0) > 0;
  if (!hasFacts) return false;
  if (!candidate.factCheckedAt) return true; // aldri verifisert
  return daysBetween(now, candidate.factCheckedAt) > max;
}

/** Bestem gjenbruksmodus. Kanal-mismatch → adapt_channel (nytt derived asset). Språk → adapt_language. Utdaterte fakta → refresh_facts. */
export function determineReuseMode(candidate: ContentCandidate, input: ResolverInput): { mode: ReuseMode; needsReapproval: boolean } {
  if (!channelSuitable(candidate, input.channel)) return { mode: "adapt_channel", needsReapproval: true };
  if (input.language && candidate.language && candidate.language !== input.language) return { mode: "adapt_language", needsReapproval: true };
  if (isFactStale(candidate, input)) return { mode: "refresh_facts", needsReapproval: true };
  return { mode: "reuse_exact", needsReapproval: false };
}

export interface ScoreWeights {
  humanApproved: number;
  brandMatch: number;
  channelMatch: number;
  campaignRelevance: number;
  businessValue: number;
  experimentBacked: number;
  freshness: number;
  fatiguePenalty: number;
  recentReusePenalty: number;
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  humanApproved: 40,
  brandMatch: 20,
  channelMatch: 25,
  campaignRelevance: 15,
  businessValue: 0.05,
  experimentBacked: 30,
  freshness: 15,
  fatiguePenalty: 20,
  recentReusePenalty: 25,
};

/**
 * Score en kandidat. Brand-mismatch diskvalifiserer (aldri på tvers av brands).
 * Rangering: human approved + brand + kanal + kampanje-relevans + historisk
 * forretningsverdi + eksperiment-bekreftelse + freshness − fatigue − nylig gjenbruk.
 */
export function scoreCandidate(candidate: ContentCandidate, input: ResolverInput, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): ScoredCandidate {
  const now = input.now ?? new Date();
  const { mode, needsReapproval } = determineReuseMode(candidate, input);

  // P0-diskvalifikasjon.
  if (candidate.brandId !== input.brandId) {
    return { ...candidate, score: -Infinity, disqualified: "BRAND_MISMATCH", reuseMode: mode, needsReapproval, breakdown: {} };
  }

  const b: Record<string, number> = {};
  b.source = SOURCE_PRIORITY[candidate.source] * 5;
  b.humanApproved = candidate.humanApproved ? weights.humanApproved : 0;
  b.brandMatch = weights.brandMatch; // matcher (ellers diskvalifisert)
  b.channelMatch = channelSuitable(candidate, input.channel) ? weights.channelMatch : 0;
  b.campaignRelevance = input.campaignRelevance && (candidate.text ?? "").toLowerCase().includes(input.campaignRelevance.toLowerCase()) ? weights.campaignRelevance : 0;
  b.businessValue = Math.min(50, (candidate.businessValue ?? 0) * weights.businessValue);
  b.experimentBacked = candidate.experimentBacked ? weights.experimentBacked : 0;

  const ageDays = candidate.createdAt ? daysBetween(now, candidate.createdAt) : 999;
  b.freshness = ageDays <= 30 ? weights.freshness : ageDays <= 90 ? weights.freshness / 2 : 0;

  const usage = candidate.usageCount ?? 0;
  b.fatiguePenalty = -Math.min(3, usage) * (weights.fatiguePenalty / 3);
  const recentReuse = candidate.lastUsedAt && daysBetween(now, candidate.lastUsedAt) <= (input.recentReuseDays ?? 14);
  b.recentReusePenalty = recentReuse ? -weights.recentReusePenalty : 0;

  const score = Object.values(b).reduce((a, v) => a + v, 0);
  return { ...candidate, score: Math.round(score), reuseMode: mode, needsReapproval, breakdown: b };
}

export interface ResolveDecision {
  decision: "reuse" | "adapt" | "generate";
  chosen?: ScoredCandidate;
  /** Alle kvalifiserte kandidater, rangert. */
  ranked: ScoredCandidate[];
  reason: string;
}

/**
 * Velg beste gjenbruk over terskel, ellers beslutt å generere nytt. Kandidater
 * på feil brand er allerede diskvalifisert. adapt_* → decision "adapt" (lager
 * nytt derived asset med provenance tilbake til original).
 */
export function resolveContent(candidates: ContentCandidate[], input: ResolverInput, opts: { threshold?: number; weights?: ScoreWeights } = {}): ResolveDecision {
  const threshold = opts.threshold ?? 60;
  const scored = candidates.map((c) => scoreCandidate(c, input, opts.weights));
  const qualified = scored.filter((s) => !s.disqualified).sort((a, b) => b.score - a.score);
  const top = qualified[0];

  if (!top || top.score < threshold) {
    return { decision: "generate", ranked: qualified, reason: top ? `Beste kandidat (${top.score}) under terskel (${threshold}) — genererer nytt.` : "Ingen egnet eksisterende asset — genererer nytt." };
  }
  if (top.reuseMode === "reuse_exact") {
    return { decision: "reuse", chosen: top, ranked: qualified, reason: `Gjenbruker ${top.source} «${top.contentId}» (score ${top.score}).` };
  }
  return { decision: "adapt", chosen: top, ranked: qualified, reason: `Adapterer ${top.source} «${top.contentId}» (${top.reuseMode}, ny godkjenning: ${top.needsReapproval}).` };
}

/** Provenance for et derived/adaptert asset — sporer tilbake til original. */
export interface ContentProvenanceLink {
  parentSource: ContentSource;
  parentContentId: string;
  reuseMode: ReuseMode;
  brandId: string;
  accountId?: string | null;
  channel: string;
}

export function deriveProvenance(chosen: ScoredCandidate, input: ResolverInput): ContentProvenanceLink {
  return { parentSource: chosen.source, parentContentId: chosen.contentId, reuseMode: chosen.reuseMode, brandId: input.brandId, accountId: chosen.accountId ?? null, channel: input.channel };
}
