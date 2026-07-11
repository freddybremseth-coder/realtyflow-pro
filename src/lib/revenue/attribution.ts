import { normalizeForecastStage, STAGE_PROBABILITIES, type ForecastStage } from "@/lib/revenue/forecast";

export const ATTRIBUTION_SCOPES = ["all", "zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type AttributionScope = (typeof ATTRIBUTION_SCOPES)[number];

export const ATTRIBUTION_SOURCE_IDS = [
  "google-ads",
  "google-organic",
  "meta",
  "instagram",
  "facebook",
  "youtube",
  "property-portal",
  "referral",
  "partner",
  "email",
  "whatsapp",
  "website",
  "event",
  "direct",
  "other",
  "unknown",
] as const;
export type AttributionSourceId = (typeof ATTRIBUTION_SOURCE_IDS)[number];
export type AttributionConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export const ATTRIBUTION_SOURCE_LABELS: Record<AttributionSourceId, string> = {
  "google-ads": "Google Ads",
  "google-organic": "Google / organisk søk",
  meta: "Meta Ads",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  "property-portal": "Boligportal",
  referral: "Anbefaling",
  partner: "Partner / megler",
  email: "E-post",
  whatsapp: "WhatsApp",
  website: "Nettside",
  event: "Event / seminar",
  direct: "Direkte",
  other: "Annet",
  unknown: "Ukjent kilde",
};

export interface AttributionContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  source?: string | null;
  lead_source?: string | null;
  acquisition_source?: string | null;
  marketing_source?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  campaign?: string | null;
  campaign_name?: string | null;
  pipeline_status?: string | null;
  status?: string | null;
  stage?: string | null;
  pipeline_value?: number | string | null;
  sale_price?: number | string | null;
  commission_amount?: number | string | null;
  commission_percent?: number | string | null;
  commission_paid_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  interactions?: unknown[] | null;
}

export interface AttributionTouch {
  sourceId: AttributionSourceId;
  sourceLabel: string;
  rawSource: string;
  campaign: string | null;
  confidence: AttributionConfidence;
  attributedAt: string | null;
  evidence: string;
}

export interface AttributionSpendEntry {
  sourceId: AttributionSourceId;
  spendEur: number;
}

export interface AttributionSourceRow {
  sourceId: AttributionSourceId;
  label: string;
  spendEur: number;
  leads: number;
  active: number;
  qualified: number;
  viewings: number;
  negotiations: number;
  won: number;
  lost: number;
  unknownCommissionWins: number;
  pipelineValue: number;
  weightedPipelineValue: number;
  confirmedCommission: number;
  collectedCommission: number;
  leadToQualifiedRate: number | null;
  leadToWinRate: number | null;
  costPerLead: number | null;
  customerAcquisitionCost: number | null;
  earnedRoas: number | null;
  cashRoas: number | null;
  earnedMarketingRoiPercent: number | null;
  confidence: { high: number; medium: number; low: number; unknown: number };
  rawSources: string[];
}

export interface AttributionCampaignRow {
  campaign: string;
  sourceId: AttributionSourceId;
  leads: number;
  qualified: number;
  won: number;
  confirmedCommission: number;
}

export interface AttributionRecommendation {
  id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  href: string;
}

export interface AttributionWorkspace {
  generatedAt: string;
  scope: AttributionScope;
  periodStart: string;
  periodEnd: string;
  cohortNote: string;
  summary: {
    leads: number;
    qualified: number;
    won: number;
    lost: number;
    totalSpendEur: number;
    confirmedCommission: number;
    collectedCommission: number;
    weightedPipelineValue: number;
    costPerLead: number | null;
    customerAcquisitionCost: number | null;
    earnedRoas: number | null;
    cashRoas: number | null;
    knownSourceSharePercent: number;
    highConfidenceSharePercent: number;
    campaignCoveragePercent: number;
    confirmedCommissionCoveragePercent: number;
    bestSourceId: AttributionSourceId | null;
  };
  sources: AttributionSourceRow[];
  campaigns: AttributionCampaignRow[];
  recommendations: AttributionRecommendation[];
  warnings: string[];
}

type Candidate = {
  rawSource: string;
  campaign: string | null;
  confidence: AttributionConfidence;
  date: Date | null;
  evidence: string;
  order: number;
};

const REALTY_BRANDS = new Set(["zeneco", "soleada", "pinosoecolife", "keyholding"]);
const ACTIVE_STAGES = new Set<ForecastStage>(["NEW", "CONTACT", "QUALIFIED", "VIEWING", "NEGOTIATION", "ON_HOLD"]);
const STAGE_RANK: Record<ForecastStage, number> = { NEW: 0, CONTACT: 1, QUALIFIED: 2, VIEWING: 3, NEGOTIATION: 4, ON_HOLD: 1, WON: 5, LOST: 0 };
const CONFIDENCE_RANK: Record<AttributionConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1, UNKNOWN: 0 };

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function brandId(contact: AttributionContactInput) {
  return token(contact.brand_id || contact.brand || "zeneco") || "zeneco";
}

function normalizeSource(raw: string): AttributionSourceId {
  const value = token(raw);
  if (!value || ["unknown", "ukjent", "none", "na", "n-a"].includes(value)) return "unknown";
  if (/google.*(ads|adwords|cpc|ppc)|^(cpc|ppc|adwords)$/.test(value)) return "google-ads";
  if (/google|organic|seo|search/.test(value)) return "google-organic";
  if (/meta.*(ads|paid)|facebook-instagram|fb-ig/.test(value)) return "meta";
  if (/instagram|insta|^ig$/.test(value)) return "instagram";
  if (/facebook|^fb$/.test(value)) return "facebook";
  if (/youtube|^yt$/.test(value)) return "youtube";
  if (/idealista|fotocasa|kyero|thinkspain|rightmove|portal|finn/.test(value)) return "property-portal";
  if (/referral|recommend|anbefal|friend|family|venn|familie/.test(value)) return "referral";
  if (/partner|agent|megler|broker|collab|samarbeid/.test(value)) return "partner";
  if (/email|newsletter|mailchimp|brevo/.test(value)) return "email";
  if (/whatsapp|wa-/.test(value)) return "whatsapp";
  if (/website|web|landing|form|public-lead|zeneco-public|soleada-public|pinosoecolife-public/.test(value)) return "website";
  if (/event|seminar|webinar|messe|visningstur/.test(value)) return "event";
  if (/direct|direkte|phone|telefon|walk-in/.test(value)) return "direct";
  return "other";
}

function candidate(rawSource: unknown, campaign: unknown, confidence: AttributionConfidence, date: unknown, evidence: string, order: number): Candidate | null {
  const raw = clean(rawSource);
  if (!raw) return null;
  return { rawSource: raw, campaign: clean(campaign) || null, confidence, date: safeDate(date), evidence, order };
}

function noteCandidates(notes: string, createdAt: unknown, startOrder: number) {
  const result: Candidate[] = [];
  let order = startOrder;
  const utmRegex = /UTM\s*:\s*([^/\n]+?)(?:\s*\/\s*([^\n]+))?(?:\n|$)/gi;
  for (const match of notes.matchAll(utmRegex)) {
    const item = candidate(match[1], match[2], "LOW", createdAt, "UTM parsed from notes", order++);
    if (item) result.push(item);
  }
  const sourceRegex = /(?:Kilde|Source|Lead source)\s*:\s*([^\n]+)/gi;
  for (const match of notes.matchAll(sourceRegex)) {
    const item = candidate(match[1], null, "LOW", createdAt, "Source parsed from notes", order++);
    if (item) result.push(item);
  }
  return result;
}

function interactionCandidates(interactions: unknown[] | null | undefined, fallbackDate: unknown, startOrder: number) {
  const result: Candidate[] = [];
  let order = startOrder;
  for (const raw of Array.isArray(interactions) ? interactions : []) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, any>;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const date = item.date || item.created_at || item.createdAt || fallbackDate;
    const structured = candidate(
      metadata.utm_source || metadata.source || item.utm_source || item.source,
      metadata.utm_campaign || metadata.campaign || item.utm_campaign || item.campaign,
      metadata.utm_source || item.utm_source ? "HIGH" : "MEDIUM",
      date,
      "Structured interaction source",
      order++,
    );
    if (structured) result.push(structured);
    const content = clean(item.content || item.description);
    const match = content.match(/Ny aktivitet fra\s+([^\n]+)/i);
    if (match) {
      const parsed = candidate(match[1], null, "LOW", date, "Source parsed from interaction text", order++);
      if (parsed) result.push(parsed);
    }
  }
  return result;
}

export function extractAttribution(contact: AttributionContactInput): AttributionTouch {
  const createdAt = contact.created_at || contact.updated_at || null;
  const candidates: Candidate[] = [];
  let order = 0;

  const explicitUtm = candidate(contact.utm_source, contact.utm_campaign || contact.campaign || contact.campaign_name, "HIGH", createdAt, "Structured contact UTM", order++);
  if (explicitUtm) candidates.push(explicitUtm);
  const structured = candidate(
    contact.acquisition_source || contact.lead_source || contact.marketing_source || contact.source,
    contact.utm_campaign || contact.campaign || contact.campaign_name,
    "MEDIUM",
    createdAt,
    "Structured contact source",
    order++,
  );
  if (structured) candidates.push(structured);
  candidates.push(...interactionCandidates(contact.interactions, createdAt, order));
  order += candidates.length;
  candidates.push(...noteCandidates(clean(contact.notes), createdAt, order));

  if (candidates.length === 0) {
    return {
      sourceId: "unknown",
      sourceLabel: ATTRIBUTION_SOURCE_LABELS.unknown,
      rawSource: "",
      campaign: null,
      confidence: "UNKNOWN",
      attributedAt: safeDate(createdAt)?.toISOString() || null,
      evidence: "No source evidence",
    };
  }

  candidates.sort((a, b) => {
    const aTime = a.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.date?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    const confidence = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    return confidence || a.order - b.order;
  });
  const selected = candidates[0];
  const sourceId = normalizeSource(selected.rawSource);
  return {
    sourceId,
    sourceLabel: ATTRIBUTION_SOURCE_LABELS[sourceId],
    rawSource: selected.rawSource,
    campaign: selected.campaign,
    confidence: selected.confidence,
    attributedAt: selected.date?.toISOString() || safeDate(createdAt)?.toISOString() || null,
    evidence: selected.evidence,
  };
}

function monthRange(periodStart: string) {
  const start = new Date(`${periodStart.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end };
}

function inPeriod(value: string | null, start: Date, end: Date) {
  const date = safeDate(value);
  return Boolean(date && date >= start && date < end);
}

function confirmedCommission(contact: AttributionContactInput, stage: ForecastStage) {
  if (stage !== "WON") return { amount: 0, confirmed: true };
  const explicit = Math.max(0, numberValue(contact.commission_amount));
  if (explicit > 0) return { amount: explicit, confirmed: true };
  const rate = numberValue(contact.commission_percent);
  const value = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
  if (rate > 0 && rate <= 100 && value > 0) return { amount: value * (rate / 100), confirmed: true };
  return { amount: 0, confirmed: false };
}

function emptyRow(sourceId: AttributionSourceId, spendEur: number): AttributionSourceRow {
  return {
    sourceId,
    label: ATTRIBUTION_SOURCE_LABELS[sourceId],
    spendEur,
    leads: 0,
    active: 0,
    qualified: 0,
    viewings: 0,
    negotiations: 0,
    won: 0,
    lost: 0,
    unknownCommissionWins: 0,
    pipelineValue: 0,
    weightedPipelineValue: 0,
    confirmedCommission: 0,
    collectedCommission: 0,
    leadToQualifiedRate: null,
    leadToWinRate: null,
    costPerLead: null,
    customerAcquisitionCost: null,
    earnedRoas: null,
    cashRoas: null,
    earnedMarketingRoiPercent: null,
    confidence: { high: 0, medium: 0, low: 0, unknown: 0 },
    rawSources: [],
  };
}

function finalize(row: AttributionSourceRow) {
  row.leadToQualifiedRate = row.leads > 0 ? (row.qualified / row.leads) * 100 : null;
  row.leadToWinRate = row.leads > 0 ? (row.won / row.leads) * 100 : null;
  row.costPerLead = row.spendEur > 0 && row.leads > 0 ? row.spendEur / row.leads : null;
  row.customerAcquisitionCost = row.spendEur > 0 && row.won > 0 ? row.spendEur / row.won : null;
  row.earnedRoas = row.spendEur > 0 ? row.confirmedCommission / row.spendEur : null;
  row.cashRoas = row.spendEur > 0 ? row.collectedCommission / row.spendEur : null;
  row.earnedMarketingRoiPercent = row.spendEur > 0 ? ((row.confirmedCommission - row.spendEur) / row.spendEur) * 100 : null;
  row.rawSources = [...new Set(row.rawSources.filter(Boolean))].slice(0, 12);
  return row;
}

function scoped(contact: AttributionContactInput, scope: AttributionScope) {
  const brand = brandId(contact);
  if (!REALTY_BRANDS.has(brand)) return false;
  return scope === "all" || brand === scope;
}

export function attributionSpendStorageKey(scope: AttributionScope, periodStart: string) {
  return `revenue-attribution:${scope}:${periodStart.slice(0, 7)}`;
}

export function buildAttributionWorkspace(params: {
  contacts: AttributionContactInput[];
  scope: AttributionScope;
  periodStart: string;
  spend?: AttributionSpendEntry[];
  now?: Date;
  warnings?: string[];
}): AttributionWorkspace {
  const now = params.now || new Date();
  const { start, end } = monthRange(params.periodStart);
  const spendMap = new Map<AttributionSourceId, number>();
  for (const entry of params.spend || []) {
    if (!ATTRIBUTION_SOURCE_IDS.includes(entry.sourceId)) continue;
    spendMap.set(entry.sourceId, Math.max(0, numberValue(entry.spendEur)));
  }

  const rows = new Map<AttributionSourceId, AttributionSourceRow>();
  for (const [sourceId, spendEur] of spendMap) rows.set(sourceId, emptyRow(sourceId, spendEur));
  const campaigns = new Map<string, AttributionCampaignRow>();
  let campaignKnown = 0;
  let highConfidence = 0;
  let sourceKnown = 0;
  let wonWithConfirmedCommission = 0;
  let totalWon = 0;

  for (const contact of params.contacts.filter((item) => scoped(item, params.scope))) {
    const touch = extractAttribution(contact);
    if (!inPeriod(touch.attributedAt, start, end)) continue;
    const row = rows.get(touch.sourceId) || emptyRow(touch.sourceId, spendMap.get(touch.sourceId) || 0);
    rows.set(touch.sourceId, row);
    row.leads += 1;
    if (touch.sourceId !== "unknown") sourceKnown += 1;
    if (touch.confidence === "HIGH") { row.confidence.high += 1; highConfidence += 1; }
    else if (touch.confidence === "MEDIUM") row.confidence.medium += 1;
    else if (touch.confidence === "LOW") row.confidence.low += 1;
    else row.confidence.unknown += 1;
    if (touch.rawSource) row.rawSources.push(touch.rawSource);

    const stage = normalizeForecastStage(contact.pipeline_status || contact.status || contact.stage);
    const value = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
    if (ACTIVE_STAGES.has(stage)) {
      row.active += 1;
      row.pipelineValue += value;
      row.weightedPipelineValue += value * STAGE_PROBABILITIES[stage];
    }
    if (STAGE_RANK[stage] >= STAGE_RANK.QUALIFIED) row.qualified += 1;
    if (STAGE_RANK[stage] >= STAGE_RANK.VIEWING) row.viewings += 1;
    if (STAGE_RANK[stage] >= STAGE_RANK.NEGOTIATION) row.negotiations += 1;
    if (stage === "WON") {
      row.won += 1;
      totalWon += 1;
      const commission = confirmedCommission(contact, stage);
      if (commission.confirmed) {
        row.confirmedCommission += commission.amount;
        wonWithConfirmedCommission += 1;
        if (safeDate(contact.commission_paid_date)) row.collectedCommission += commission.amount;
      } else row.unknownCommissionWins += 1;
    }
    if (stage === "LOST") row.lost += 1;

    if (touch.campaign) {
      campaignKnown += 1;
      const key = `${touch.sourceId}:${token(touch.campaign)}`;
      const campaign = campaigns.get(key) || { campaign: touch.campaign, sourceId: touch.sourceId, leads: 0, qualified: 0, won: 0, confirmedCommission: 0 };
      campaign.leads += 1;
      if (STAGE_RANK[stage] >= STAGE_RANK.QUALIFIED) campaign.qualified += 1;
      if (stage === "WON") {
        campaign.won += 1;
        campaign.confirmedCommission += confirmedCommission(contact, stage).amount;
      }
      campaigns.set(key, campaign);
    }
  }

  const sources = [...rows.values()].map(finalize).sort((a, b) =>
    b.confirmedCommission - a.confirmedCommission || b.won - a.won || b.qualified - a.qualified || b.leads - a.leads,
  );
  const totals = sources.reduce((acc, row) => ({
    leads: acc.leads + row.leads,
    qualified: acc.qualified + row.qualified,
    won: acc.won + row.won,
    lost: acc.lost + row.lost,
    spend: acc.spend + row.spendEur,
    commission: acc.commission + row.confirmedCommission,
    collected: acc.collected + row.collectedCommission,
    weighted: acc.weighted + row.weightedPipelineValue,
  }), { leads: 0, qualified: 0, won: 0, lost: 0, spend: 0, commission: 0, collected: 0, weighted: 0 });

  const knownShare = totals.leads > 0 ? (sourceKnown / totals.leads) * 100 : 100;
  const highShare = totals.leads > 0 ? (highConfidence / totals.leads) * 100 : 0;
  const campaignCoverage = totals.leads > 0 ? (campaignKnown / totals.leads) * 100 : 0;
  const commissionCoverage = totalWon > 0 ? (wonWithConfirmedCommission / totalWon) * 100 : 100;
  const recommendations: AttributionRecommendation[] = [];
  if (knownShare < 80) recommendations.push({ id: "unknown-source", priority: "HIGH", title: "For mange leads mangler kilde", description: `${Math.round(100 - knownShare)} % av månedens leads kan ikke attribueres sikkert. Registrer source eller UTM ved opprettelse.`, href: "/customers" });
  if (totalWon > 0 && commissionCoverage < 100) recommendations.push({ id: "commission-coverage", priority: "HIGH", title: "Vunne salg mangler provisjonsgrunnlag", description: `${totalWon - wonWithConfirmedCommission} vunne saker kan ikke brukes i kanaløkonomien før faktisk provisjon er registrert.`, href: "/commissions" });
  for (const row of sources) {
    if (row.spendEur > 0 && row.leads === 0) recommendations.push({ id: `spend-no-leads-${row.sourceId}`, priority: "CRITICAL", title: `${row.label}: kostnad uten registrerte leads`, description: `${Math.round(row.spendEur)} € er registrert i kostnad, men ingen leads er attribuert til kanalen i kohorten. Kontroller tracking og periode.`, href: "/attribution" });
    else if (row.leads >= 3 && row.qualified === 0) recommendations.push({ id: `no-quality-${row.sourceId}`, priority: "HIGH", title: `${row.label}: ingen kvalifiserte leads`, description: `${row.leads} leads er registrert uten at noen har nådd kvalifisert status. Kontroller målgruppe, budskap og leadkvalitet.`, href: "/pipeline" });
    else if (row.unknownCommissionWins > 0) recommendations.push({ id: `unknown-commission-${row.sourceId}`, priority: "MEDIUM", title: `${row.label}: salg uten bekreftet provisjon`, description: `${row.unknownCommissionWins} vunne saker mangler beløp eller sats og er derfor utelatt fra ROAS.`, href: "/commissions" });
  }
  recommendations.sort((a, b) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[a.priority] - { CRITICAL: 0, HIGH: 1, MEDIUM: 2 }[b.priority]));

  const best = sources.find((row) => row.won > 0 || row.qualified > 0) || null;
  const warnings = [...(params.warnings || [])];
  if (totals.spend === 0) warnings.push("Ingen markedsføringskostnader er registrert for perioden. CAC og ROAS vises derfor ikke.");
  if (totals.leads === 0 && end <= now) warnings.push("Ingen leads finnes i valgt måned og scope.");

  return {
    generatedAt: now.toISOString(),
    scope: params.scope,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    cohortNote: "Kohorten består av leads med første registrerte kilde i valgt måned. Senere salg og provisjon attribueres tilbake til denne kilden.",
    summary: {
      leads: totals.leads,
      qualified: totals.qualified,
      won: totals.won,
      lost: totals.lost,
      totalSpendEur: totals.spend,
      confirmedCommission: totals.commission,
      collectedCommission: totals.collected,
      weightedPipelineValue: totals.weighted,
      costPerLead: totals.spend > 0 && totals.leads > 0 ? totals.spend / totals.leads : null,
      customerAcquisitionCost: totals.spend > 0 && totals.won > 0 ? totals.spend / totals.won : null,
      earnedRoas: totals.spend > 0 ? totals.commission / totals.spend : null,
      cashRoas: totals.spend > 0 ? totals.collected / totals.spend : null,
      knownSourceSharePercent: knownShare,
      highConfidenceSharePercent: highShare,
      campaignCoveragePercent: campaignCoverage,
      confirmedCommissionCoveragePercent: commissionCoverage,
      bestSourceId: best?.sourceId || null,
    },
    sources,
    campaigns: [...campaigns.values()].sort((a, b) => b.confirmedCommission - a.confirmedCommission || b.won - a.won || b.leads - a.leads).slice(0, 30),
    recommendations: recommendations.slice(0, 12),
    warnings,
  };
}
