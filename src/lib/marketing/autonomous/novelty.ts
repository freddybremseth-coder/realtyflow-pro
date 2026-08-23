/**
 * Phase 7 — novelty / fatigue-motor. Hindrer 300 nesten-identiske innlegg.
 * Sammenligner kandidat mot historikk (tema/hook/eiendom/kreativ/CTA/kampanje +
 * tekstlig vinkel + nylighet) og gir en contentNoveltyScore + beslutning.
 */

import type { ContentGenome } from "../genome";

export interface ContentHistoryItem {
  genome: ContentGenome;
  angle?: string;
  usedAt: string;
  campaignId?: string;
}

export interface NoveltyCandidate {
  genome: ContentGenome;
  angle?: string;
  campaignId?: string;
}

const SIM_DIMENSIONS: Array<keyof ContentGenome> = ["hookType", "topic", "contentPillar", "propertyType", "area", "creativeStyle", "ctaType", "format", "propertyId"];

function tokens(s?: string): Set<string> {
  return new Set((s ?? "").toLowerCase().split(/[^a-z0-9æøå]+/i).filter((t) => t.length > 2));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter || 1);
}

function genomeSimilarity(a: ContentGenome, b: ContentGenome): number {
  let match = 0;
  let counted = 0;
  for (const d of SIM_DIMENSIONS) {
    const av = a[d];
    const bv = b[d];
    if (av == null && bv == null) continue;
    counted++;
    if (av != null && av === bv) match++;
  }
  return counted === 0 ? 0 : match / counted;
}

export interface NoveltyResult {
  /** Høyeste likhet mot historikk (0..1). */
  similarity: number;
  /** 0..100 — høyere = mer nytt. */
  noveltyScore: number;
  lastUsedDays: number | null;
  decision: "ok" | "regenerate";
  reasons: string[];
}

export interface NoveltyOptions {
  /** Likhet >= dette → regenerate (default 0.85). */
  rejectThreshold?: number;
  /** Likhet >= dette OG brukt nylig → regenerate (default 0.7). */
  fatigueThreshold?: number;
  /** "Nylig" i dager (default 14). */
  recentDays?: number;
  now?: Date | string;
}

export function contentNoveltyScore(candidate: NoveltyCandidate, history: ContentHistoryItem[], opts: NoveltyOptions = {}): NoveltyResult {
  const rejectAt = opts.rejectThreshold ?? 0.85;
  const fatigueAt = opts.fatigueThreshold ?? 0.7;
  const recentDays = opts.recentDays ?? 14;
  const now = new Date(opts.now ?? new Date()).getTime();

  let similarity = 0;
  let lastUsedDays: number | null = null;
  const candTokens = tokens(candidate.angle);

  for (const h of history) {
    const gsim = genomeSimilarity(candidate.genome, h.genome);
    const asim = jaccard(candTokens, tokens(h.angle));
    const sim = Number((0.6 * gsim + 0.4 * asim).toFixed(2));
    if (sim > similarity) {
      similarity = sim;
      lastUsedDays = Math.floor((now - new Date(h.usedAt).getTime()) / 86_400_000);
    }
  }

  const reasons: string[] = [];
  let decision: NoveltyResult["decision"] = "ok";
  if (similarity >= rejectAt) {
    decision = "regenerate";
    reasons.push(`For lik eksisterende innhold (${Math.round(similarity * 100)}%).`);
  } else if (similarity >= fatigueAt && lastUsedDays != null && lastUsedDays <= recentDays) {
    decision = "regenerate";
    reasons.push(`Lignende vinkel brukt for ${lastUsedDays} dager siden (${Math.round(similarity * 100)}%).`);
  }
  if (decision === "ok") reasons.push("Tilstrekkelig ny vinkel.");

  return { similarity, noveltyScore: Math.round((1 - similarity) * 100), lastUsedDays, decision, reasons };
}
