/**
 * Marketing Growth OS — Business Value Score.
 *
 * Ett felles mål på forretningsverdien av innhold, slik at systemet lærer av
 * det som gir KUNDER, ikke av vanity-metrics. En post med 8 000 views og 1 salg
 * skal slå en post med 100 000 views og 0 leads.
 *
 * Vektene er kalibrerbare — juster i takt med faktisk data.
 */

export interface ContentMetrics {
  views?: number | null;
  impressions?: number | null;
  engagedViews?: number | null;
  reactions?: number | null;
  comments?: number | null;
  saves?: number | null;
  shares?: number | null;
  clicks?: number | null;
  leads?: number | null;
  qualifiedLeads?: number | null;
  viewings?: number | null;
  offers?: number | null;
  sales?: number | null;
  commissionEur?: number | null;
}

export interface ValueWeights {
  views: number;
  impressions: number;
  engagedViews: number;
  reactions: number;
  comments: number;
  saves: number;
  shares: number;
  clicks: number;
  leads: number;
  qualifiedLeads: number;
  viewings: number;
  offers: number;
  sales: number;
  /** Andel av attribuert provisjon (EUR) som legges til scoren. */
  commissionFactor: number;
}

export const DEFAULT_WEIGHTS: ValueWeights = {
  views: 0.01,
  impressions: 0.005,
  engagedViews: 0.03,
  reactions: 0.2,
  comments: 0.5,
  saves: 1,
  shares: 2,
  clicks: 3,
  leads: 20,
  qualifiedLeads: 50,
  viewings: 150,
  offers: 400,
  sales: 1000,
  commissionFactor: 0.02,
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function businessValueScore(m: ContentMetrics, weights: ValueWeights = DEFAULT_WEIGHTS): number {
  const score =
    n(m.views) * weights.views +
    n(m.impressions) * weights.impressions +
    n(m.engagedViews) * weights.engagedViews +
    n(m.reactions) * weights.reactions +
    n(m.comments) * weights.comments +
    n(m.saves) * weights.saves +
    n(m.shares) * weights.shares +
    n(m.clicks) * weights.clicks +
    n(m.leads) * weights.leads +
    n(m.qualifiedLeads) * weights.qualifiedLeads +
    n(m.viewings) * weights.viewings +
    n(m.offers) * weights.offers +
    n(m.sales) * weights.sales +
    n(m.commissionEur) * weights.commissionFactor;
  return Math.round(score);
}

/** Kvalifisert-lead-rate — kjernemetrikk for læring (per 1000 eksponeringer). */
export function qualifiedLeadRate(m: ContentMetrics): number {
  const exposure = Math.max(n(m.views), n(m.impressions));
  if (exposure <= 0) return 0;
  return Number(((n(m.qualifiedLeads) / exposure) * 1000).toFixed(2));
}

export const EVIDENCE_LEVELS = ["insufficient", "directional", "promising", "reliable", "strong"] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

/** Ordinal rangering av evidensnivå — for terskler («minst reliable»). */
export function evidenceRank(level: EvidenceLevel): number {
  return EVIDENCE_LEVELS.indexOf(level);
}

/**
 * Nok observasjoner til å stole på et funn? (fra brukerens råd: ikke
 * optimaliser for tidlig). Returnerer tillitsnivå basert på utvalgsstørrelse.
 */
export function evidenceLevel(sample: number): EvidenceLevel {
  if (sample < 5) return "insufficient";
  if (sample < 10) return "directional";
  if (sample < 25) return "promising";
  if (sample < 60) return "reliable";
  return "strong";
}
