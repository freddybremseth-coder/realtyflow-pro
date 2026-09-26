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
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(utm)) {
      if (value != null && String(value).trim()) parsed.searchParams.set(key, String(value));
    }
    return parsed.toString();
  } catch {
    const q = new URLSearchParams(Object.entries(utm).filter(([, v]) => v != null) as [string, string][]).toString();
    return url.includes("?") ? `${url}&${q}` : `${url}?${q}`;
  }
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
  /** Persisted idempotency key when the row is loaded from Supabase. */
  dedupeKey?: string | null;
  /** Required tenancy boundary. Never infer a brand later from content text. */
  brandId: string;
  contentId?: string | null;
  publicationId?: string | null;
  campaignId?: string | null;
  creativeVariantId?: string | null;
  visitorId?: string | null;
  /** Session identity is kept in metadata until the table has a dedicated column. */
  sessionId?: string | null;
  contactId?: string | null;
  channel?: string | null;
  touchType: TouchType;
  occurredAt: string;
  confidence?: AttributionConfidence;
  commissionEur?: number | null;
  metadata?: Record<string, unknown>;
}

/** Stabil dedupe-nøkkel (idempotens): samme hendelse skal aldri attribueres to ganger.
 * Brand og creative-variant er del av nøkkelen slik at to annonser som peker på
 * samme content aldri kolliderer i attribution-ledgeren. */
export function touchpointDedupeKey(t: MarketingTouchpoint): string {
  const who = t.contactId || t.visitorId || t.sessionId || "anon";
  const minute = (t.occurredAt || "").slice(0, 16);
  const creative = t.creativeVariantId || "-";
  return `${t.brandId}|${who}|${t.touchType}|${t.contentId ?? "-"}|${creative}|${minute}`;
}

function identitySetAdd(map: Map<string, Set<string>>, key: string | null, contactId: string | null) {
  if (!key || !contactId) return;
  const values = map.get(key) ?? new Set<string>();
  values.add(contactId);
  map.set(key, values);
}

/**
 * Stitch anonymous acquisition touches to the canonical CRM journey. Linking is
 * brand-scoped and only happens when visitor/session identity resolves to
 * exactly one contact. Shared or conflicting identities fail closed.
 */
export function stitchAttributionJourneys(touches: MarketingTouchpoint[]): Journey[] {
  const unique = new Map<string, MarketingTouchpoint>();
  for (const touch of touches) {
    const fallback = touchpointDedupeKey(touch);
    const key = touch.dedupeKey || touch.touchpointId || fallback;
    if (!unique.has(key)) unique.set(key, touch);
  }

  const visitorContacts = new Map<string, Set<string>>();
  const sessionContacts = new Map<string, Set<string>>();
  for (const touch of unique.values()) {
    const brand = touch.brandId;
    identitySetAdd(visitorContacts, touch.visitorId ? `${brand}|${touch.visitorId}` : null, touch.contactId ?? null);
    identitySetAdd(sessionContacts, touch.sessionId ? `${brand}|${touch.sessionId}` : null, touch.contactId ?? null);
  }

  const groups = new Map<string, MarketingTouchpoint[]>();
  for (const touch of unique.values()) {
    const visitorMatches = touch.visitorId ? visitorContacts.get(`${touch.brandId}|${touch.visitorId}`) : undefined;
    const sessionMatches = touch.sessionId ? sessionContacts.get(`${touch.brandId}|${touch.sessionId}`) : undefined;
    const visitorContact = visitorMatches?.size === 1 ? [...visitorMatches][0] : null;
    const sessionContact = sessionMatches?.size === 1 ? [...sessionMatches][0] : null;
    const inferredContact = visitorContact && sessionContact && visitorContact !== sessionContact
      ? null
      : visitorContact || sessionContact;
    const identity = touch.contactId
      ? `contact:${touch.contactId}`
      : inferredContact
        ? `contact:${inferredContact}`
        : touch.visitorId
          ? `visitor:${touch.visitorId}`
          : touch.sessionId
            ? `session:${touch.sessionId}`
            : `touch:${touch.touchpointId || touch.dedupeKey || touchpointDedupeKey(touch)}`;
    const groupKey = `${touch.brandId}|${identity}`;
    const group = groups.get(groupKey) ?? [];
    group.push(touch);
    groups.set(groupKey, group);
  }

  return [...groups.values()].map((group) => ({
    touches: group.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  }));
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
  credit: Map<string, number>;
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

export interface CanonicalAttributionOutcomeRow {
  brandId: string;
  channel: string;
  campaignId: string;
  contentId: string;
  publicationId: string;
  leads: number;
  qualified: number;
  viewings: number;
  offers: number;
  sales: number;
  commissionEur: number;
  assistedConversions: number;
}

export interface CanonicalLeadAttributionReport {
  sourceOfTruth: "marketing_touchpoints + revenue_events";
  deterministicOnly: true;
  model: AttributionModel;
  periodStart: string;
  periodEnd: string;
  summary: {
    leads: number;
    qualified: number;
    viewings: number;
    offers: number;
    sales: number;
    commissionEur: number;
    assistedConversions: number;
    attributedLeads: number;
    coveragePercent: number;
  };
  brands: CanonicalAttributionOutcomeRow[];
  channels: CanonicalAttributionOutcomeRow[];
  campaigns: CanonicalAttributionOutcomeRow[];
}

type AttributionDimension = Pick<CanonicalAttributionOutcomeRow, "brandId" | "channel" | "campaignId" | "contentId" | "publicationId">;

const unknownDimension = (touch: MarketingTouchpoint): AttributionDimension => ({
  brandId: touch.brandId || "unknown",
  channel: String(touch.channel || "unknown").toLowerCase(),
  campaignId: String(touch.campaignId || "unknown"),
  contentId: String(touch.contentId || "unknown"),
  publicationId: String(touch.publicationId || "unknown"),
});

const dimensionKey = (d: AttributionDimension) => [d.brandId, d.channel, d.campaignId, d.contentId, d.publicationId].join("|");

function journeyCredits(touches: MarketingTouchpoint[], model: AttributionModel): Array<{ dimension: AttributionDimension; weight: number; primary: boolean }> {
  const candidates = touches.filter((touch) =>
    Boolean(touch.contentId || touch.publicationId || touch.campaignId || touch.channel),
  );
  const ordered = candidates.slice().sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (!ordered.length) return [];

  const distinct = new Map<string, AttributionDimension>();
  for (const touch of ordered) {
    const dimension = unknownDimension(touch);
    distinct.set(dimensionKey(dimension), dimension);
  }
  const dimensions = [...distinct.values()];
  if (model === "linear") {
    return dimensions.map((dimension, index) => ({ dimension, weight: 1 / dimensions.length, primary: index === 0 }));
  }
  const winner = model === "first_touch"
    ? unknownDimension(ordered[0])
    : unknownDimension([...ordered].reverse().find((touch) => !isDirect(touch.channel)) ?? ordered[ordered.length - 1]);
  return dimensions.map((dimension) => ({
    dimension,
    weight: dimensionKey(dimension) === dimensionKey(winner) ? 1 : 0,
    primary: dimensionKey(dimension) === dimensionKey(winner),
  }));
}

function periodBounds(periodStart: string) {
  const start = new Date(`${periodStart.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Canonical lead-cohort report. Cohort membership is fixed by lead_created in
 * the selected month; later qualified/viewing/offer/sale events remain part of
 * that journey. Form submissions never count as leads.
 */
export function buildCanonicalLeadAttribution(params: {
  touches: MarketingTouchpoint[];
  periodStart: string;
  scope?: string;
  model?: AttributionModel;
}): CanonicalLeadAttributionReport {
  const model = params.model ?? "last_touch";
  const { start, end } = periodBounds(params.periodStart);
  const scoped = params.touches.filter((touch) => !params.scope || params.scope === "all" || touch.brandId === params.scope);
  const journeys = stitchAttributionJourneys(scoped);
  const rows = new Map<string, CanonicalAttributionOutcomeRow>();
  const emptyRow = (dimension: AttributionDimension): CanonicalAttributionOutcomeRow => ({
    ...dimension, leads: 0, qualified: 0, viewings: 0, offers: 0, sales: 0, commissionEur: 0, assistedConversions: 0,
  });
  let leads = 0;
  let qualified = 0;
  let viewings = 0;
  let offers = 0;
  let sales = 0;
  let commissionEur = 0;
  let assistedConversions = 0;
  let attributedLeads = 0;

  for (const journey of journeys) {
    const lead = journey.touches.find((touch) => touch.touchType === "lead_created" && touch.occurredAt >= start && touch.occurredAt < end);
    if (!lead) continue;
    leads += 1;
    const afterLead = journey.touches.filter((touch) => touch.occurredAt >= lead.occurredAt);
    const rank = Math.max(1, ...afterLead.map((touch) => outcomeRankOf(touch.touchType)));
    const saleCommission = afterLead
      .filter((touch) => touch.touchType === "sale")
      .reduce((sum, touch) => sum + (Number(touch.commissionEur) || 0), 0);
    if (rank >= 2) qualified += 1;
    if (rank >= 3) viewings += 1;
    if (rank >= 4) offers += 1;
    if (rank >= 5) { sales += 1; commissionEur += saleCommission; }

    const credits = journeyCredits(journey.touches.filter((touch) => touch.occurredAt <= lead.occurredAt), model);
    if (!credits.length) continue;
    attributedLeads += 1;
    for (const credit of credits) {
      const key = dimensionKey(credit.dimension);
      const row = rows.get(key) ?? emptyRow(credit.dimension);
      if (credit.weight > 0) {
        row.leads = r2(row.leads + credit.weight);
        if (rank >= 2) row.qualified = r2(row.qualified + credit.weight);
        if (rank >= 3) row.viewings = r2(row.viewings + credit.weight);
        if (rank >= 4) row.offers = r2(row.offers + credit.weight);
        if (rank >= 5) {
          row.sales = r2(row.sales + credit.weight);
          row.commissionEur = r2(row.commissionEur + saleCommission * credit.weight);
        }
      } else if (rank >= 5) {
        row.assistedConversions += 1;
        assistedConversions += 1;
      }
      rows.set(key, row);
    }
  }

  const aggregate = (keys: Array<keyof AttributionDimension>) => {
    const output = new Map<string, CanonicalAttributionOutcomeRow>();
    for (const row of rows.values()) {
      const dimension: AttributionDimension = {
        brandId: keys.includes("brandId") ? row.brandId : "all",
        channel: keys.includes("channel") ? row.channel : "all",
        campaignId: keys.includes("campaignId") ? row.campaignId : "all",
        contentId: keys.includes("contentId") ? row.contentId : "all",
        publicationId: keys.includes("publicationId") ? row.publicationId : "all",
      };
      const key = dimensionKey(dimension);
      const target = output.get(key) ?? emptyRow(dimension);
      target.leads = r2(target.leads + row.leads);
      target.qualified = r2(target.qualified + row.qualified);
      target.viewings = r2(target.viewings + row.viewings);
      target.offers = r2(target.offers + row.offers);
      target.sales = r2(target.sales + row.sales);
      target.commissionEur = r2(target.commissionEur + row.commissionEur);
      target.assistedConversions += row.assistedConversions;
      output.set(key, target);
    }
    return [...output.values()].sort((a, b) => b.commissionEur - a.commissionEur || b.leads - a.leads);
  };

  return {
    sourceOfTruth: "marketing_touchpoints + revenue_events",
    deterministicOnly: true,
    model,
    periodStart: start.slice(0, 10),
    periodEnd: end.slice(0, 10),
    summary: {
      leads, qualified, viewings, offers, sales,
      commissionEur: r2(commissionEur), assistedConversions, attributedLeads,
      coveragePercent: leads ? r2((attributedLeads / leads) * 100) : 0,
    },
    brands: aggregate(["brandId"]),
    channels: aggregate(["brandId", "channel"]),
    campaigns: aggregate(["brandId", "channel", "campaignId"]),
  };
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
    if (rank < 1) continue;
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
