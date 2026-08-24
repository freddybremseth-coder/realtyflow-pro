/**
 * Marketing Growth OS — Phase 4: Revenue Attribution (touchpoint/identity-lag).
 *
 *   content → click/landing/cta → form_submit → lead → qualified → viewing →
 *   offer → sale → commission
 *
 * Hver downstream revenue-hendelse spores tilbake til ett eller flere content/
 * campaign-touchpoints. Metric ownership (Phase 4-regel): CRM/attribution eier
 * canonical outcomes (leads/qualified/viewings/offers/sales/commission) — de
 * telles her, ALDRI fra nettside-skjema (som kun er et touchpoint). revenue_
 * events er source-of-truth for downstream utfall; ingen parallell ledger.
 */

import type { MarketingChannel } from "./genome";
import type { ContentMetrics } from "./value-score";

/* ---- UTM / identitet ---- */

export interface ContentUtm {
  utm_source: string;
  utm_medium: string;
  utm_campaign?: string;
  utm_content: string;
}

/** utm_content bærer publication_id/content_id — stabil identitet, ikke tekst-match. */
export function buildContentUtm(args: { channel: MarketingChannel | string; contentId: string; campaign?: string }): ContentUtm {
  return {
    utm_source: String(args.channel),
    utm_medium: "organic",
    ...(args.campaign ? { utm_campaign: args.campaign } : {}),
    utm_content: args.contentId,
  };
}

export function withUtm(url: string, utm: ContentUtm): string {
  const q = new URLSearchParams(Object.entries(utm).filter(([, v]) => v != null) as [string, string][]).toString();
  return url.includes("?") ? `${url}&${q}` : `${url}?${q}`;
}

/* ---- Touchpoints ---- */

export const TOUCH_TYPES = [
  "impression", "click", "landing", "cta", "form_submit",
  "lead_created", "qualified", "viewing", "offer", "sale",
] as const;
export type TouchType = (typeof TOUCH_TYPES)[number];

export type AttributionConfidence = "exact" | "strong" | "probable" | "unknown";

export interface MarketingTouchpoint {
  touchpointId?: string;
  /** Required tenancy boundary. Never infer a brand later from content text. */
  brandId: string;
  contentId?: string | null;
  publicationId?: string | null;
  campaignId?: string | null;
  creativeVariantId?: string | null;
  visitorId?: string | null;
  contactId?: string | null;
  channel?: string | null;
  touchType: TouchType;
  occurredAt: string; // ISO
  confidence?: AttributionConfidence;
  commissionEur?: number | null; // på sale-touch
  metadata?: Record<string, unknown>;
}

/** Stabil dedupe-nøkkel (idempotens): samme hendelse skal aldri attribueres to ganger.
 * Brand er del av nøkkelen slik at identiske kontakt/content-identiteter i to brands
 * aldri kolliderer i attribution-ledgeren. */
export function touchpointDedupeKey(t: MarketingTouchpoint): string {
  const who = t.contactId || t.visitorId || "anon";
  const minute = (t.occurredAt || "").slice(0, 16); // minutt-oppløsning
  return `${t.brandId}|${who}|${t.touchType}|${t.contentId ?? "-"}|${minute}`;
}

/** Confidence for en resolvert touch: exact = utm_content/publication + identitet. */
export function touchConfidence(t: MarketingTouchpoint): AttributionConfidence {
  if (t.confidence) return t.confidence;
  if ((t.contentId || t.publicationId) && (t.contactId || t.visitorId)) return "exact";
  if (t.contentId || t.publicationId) return "strong";
  if (t.campaignId || t.channel) return "probable";
  return "unknown";
}

/* ---- Funnel-rank ---- */

const OUTCOME_RANK: Record<string, number> = {
  lead_created: 1, qualified: 2, viewing: 3, offer: 4, sale: 5,
};
export function outcomeRankOf(touchType: TouchType): number {
  return OUTCOME_RANK[touchType] ?? 0;
}

/* ---- Attribusjonsmodeller ---- */

export const ATTRIBUTION_MODELS = ["first_touch", "last_touch", "linear"] as const;
export type AttributionModel = (typeof ATTRIBUTION_MODELS)[number];

const isDirect = (channel?: string | null) => !channel || String(channel).toLowerCase() === "direct";

export interface JourneyCredit {
  credit: Map<string, number>; // contentId → vekt (summerer til 1)
  contentsTouched: string[];
  primaryContent: string | null;
}

/**
 * Fordel kreditt over content-touchpoints i én kundes reise iht. modell.
 * last_touch = siste non-direct content-touch (multi-touch bevares for analyse).
 */
export function attributeJourneyCredit(touches: MarketingTouchpoint[], model: AttributionModel): JourneyCredit {
  const contentTouches = touches
    .filter((t) => t.contentId)
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const contentsTouched = Array.from(new Set(contentTouches.map((t) => t.contentId as string)));
  const credit = new Map<string, number>();
  if (contentTouches.length === 0) return { credit, contentsTouched, primaryContent: null };

  if (model === "linear") {
    const w = 1 / contentsTouched.length;
    contentsTouched.forEach((c) => credit.set(c, w));
    return { credit, contentsTouched, primaryContent: contentsTouched[0] };
  }

  if (model === "first_touch") {
    const first = contentTouches[0].contentId as string;
    credit.set(first, 1);
    return { credit, contentsTouched, primaryContent: first };
  }

  // last_touch (non-direct)
  const lastNonDirect = [...contentTouches].reverse().find((t) => !isDirect(t.channel));
  const winner = (lastNonDirect ?? contentTouches[contentTouches.length - 1]).contentId as string;
  credit.set(winner, 1);
  return { credit, contentsTouched, primaryContent: winner };
}

/* ---- Canonical business metrics per content ---- */

export interface ContentBusinessMetrics {
  leads: number;
  qualifiedLeads: number;
  viewings: number;
  offers: number;
  sales: number;
  commissionEur: number;
  assistedConversions: number;
}

const emptyBiz = (): ContentBusinessMetrics => ({
  leads: 0, qualifiedLeads: 0, viewings: 0, offers: 0, sales: 0, commissionEur: 0, assistedConversions: 0,
});
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Journey {
  touches: MarketingTouchpoint[];
}

/**
 * Rull opp reiser til canonical business metrics per content (vektet iht.
 * modell). Assisted = content som var et touch i en konverterende reise, men
 * ikke fikk full/primær kreditt (multi-touch). Idempotent på touch-nivå
 * forutsettes håndtert i lagringslaget (dedupe key + unique constraint).
 */
export function rollupContentOutcomes(journeys: Journey[], model: AttributionModel = "last_touch"): Map<string, ContentBusinessMetrics> {
  const out = new Map<string, ContentBusinessMetrics>();
  const bump = (id: string) => out.get(id) ?? out.set(id, emptyBiz()).get(id)!;

  for (const j of journeys) {
    const rank = Math.max(0, ...j.touches.map((t) => outcomeRankOf(t.touchType)));
    if (rank < 1) continue; // ingen canonical outcome → ikke tell (organisk uten konvertering)
    const commission = j.touches.filter((t) => t.touchType === "sale").reduce((s, t) => s + (Number(t.commissionEur) || 0), 0);
    const { credit, contentsTouched, primaryContent } = attributeJourneyCredit(j.touches, model);
    if (contentsTouched.length === 0) continue;

    for (const [contentId, w] of credit) {
      const b = bump(contentId);
      b.leads = r2(b.leads + w);
      if (rank >= 2) b.qualifiedLeads = r2(b.qualifiedLeads + w);
      if (rank >= 3) b.viewings = r2(b.viewings + w);
      if (rank >= 4) b.offers = r2(b.offers + w);
      if (rank >= 5) {
        b.sales = r2(b.sales + w);
        b.commissionEur = r2(b.commissionEur + w * commission);
      }
    }
    // Assisted: touchede content som ikke er primær vinner.
    for (const c of contentsTouched) {
      if (c !== primaryContent) bump(c).assistedConversions += 1;
    }
  }
  return out;
}

/** Business-delen av ContentMetrics for ett innhold (mates til combineMetrics som canonical). */
export function canonicalMetricsForContent(journeys: Journey[], contentId: string, model: AttributionModel = "last_touch"): Partial<ContentMetrics> {
  const b = rollupContentOutcomes(journeys, model).get(contentId) ?? emptyBiz();
  return { leads: b.leads, qualifiedLeads: b.qualifiedLeads, viewings: b.viewings, offers: b.offers, sales: b.sales, commissionEur: b.commissionEur };
}
