export type ForecastStage =
  | "NEW"
  | "CONTACT"
  | "QUALIFIED"
  | "VIEWING"
  | "NEGOTIATION"
  | "ON_HOLD"
  | "WON"
  | "LOST";

export type ForecastRisk = "HIGH" | "MEDIUM" | "LOW";

export interface ForecastContactInput {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipeline_status?: string | null;
  status?: string | null;
  stage?: string | null;
  pipeline_value?: number | string | null;
  sale_price?: number | string | null;
  commission_amount?: number | string | null;
  commission_percent?: number | string | null;
  commission_paid_date?: string | null;
  brand_id?: string | null;
  brand?: string | null;
  source?: string | null;
  notes?: string | null;
  interactions?: unknown[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_contact?: string | null;
  next_followup?: string | null;
  won_at?: string | null;
  closed_at?: string | null;
  sale_date?: string | null;
  lost_at?: string | null;
}

export interface ForecastDeal {
  id: string;
  name: string;
  stage: ForecastStage;
  brandId: string;
  dealValue: number;
  commissionRate: number;
  commissionRateEstimated: boolean;
  grossCommission: number;
  probability: number;
  weightedValue: number;
  weightedCommission: number;
  forecast30Commission: number;
  forecast90Commission: number;
  ageDays: number;
  staleDays: number;
  stale: boolean;
  overdue: boolean;
  missingNextFollowup: boolean;
  missingValue: boolean;
  missingContactChannel: boolean;
  healthScore: number;
  risk: ForecastRisk;
  issues: string[];
  recommendedAction: string;
  nextFollowupAt: string | null;
  expectedWindow: string;
  href: string;
}

export interface ForecastStageSummary {
  stage: ForecastStage;
  label: string;
  probability: number;
  count: number;
  rawValue: number;
  weightedValue: number;
  weightedCommission: number;
  averageAgeDays: number;
  staleCount: number;
  overdueCount: number;
  missingValueCount: number;
}

export interface ForecastBrandSummary {
  brandId: string;
  activeCount: number;
  openValue: number;
  weightedValue: number;
  weightedCommission: number;
  wonCommission: number;
  unpaidWonCommission: number;
  atRiskCount: number;
}

export interface RevenueForecast {
  generatedAt: string;
  assumptions: {
    fallbackCommissionPercent: number;
    stageProbabilities: Record<ForecastStage, number>;
    note: string;
  };
  summary: {
    activeDeals: number;
    openPipelineValue: number;
    weightedPipelineValue: number;
    weightedCommission: number;
    forecast30Commission: number;
    forecast90Commission: number;
    wonDeals: number;
    lostDeals: number;
    registeredOutcomeWinRate: number | null;
    wonCommission: number;
    unpaidWonCommission: number;
    atRiskDeals: number;
    overdueDeals: number;
    staleDeals: number;
    missingValueDeals: number;
    missingNextFollowupDeals: number;
    dataQualityScore: number;
    bottleneckStage: ForecastStage | null;
  };
  scenarios: {
    conservativeCommission: number;
    baseCommission: number;
    upsideCommission: number;
  };
  stages: ForecastStageSummary[];
  brands: ForecastBrandSummary[];
  deals: ForecastDeal[];
}

export const FALLBACK_COMMISSION_PERCENT = 3;

export const STAGE_PROBABILITIES: Record<ForecastStage, number> = {
  NEW: 0.05,
  CONTACT: 0.12,
  QUALIFIED: 0.3,
  VIEWING: 0.55,
  NEGOTIATION: 0.8,
  ON_HOLD: 0.1,
  WON: 1,
  LOST: 0,
};

const ACTIVE_STAGES = new Set<ForecastStage>([
  "NEW",
  "CONTACT",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "ON_HOLD",
]);

const STAGE_LABELS: Record<ForecastStage, string> = {
  NEW: "Ny",
  CONTACT: "Kontaktet",
  QUALIFIED: "Kvalifisert",
  VIEWING: "Visning",
  NEGOTIATION: "Forhandling",
  ON_HOLD: "På vent",
  WON: "Vunnet",
  LOST: "Tapt",
};

const STAGE_ORDER: ForecastStage[] = [
  "NEW",
  "CONTACT",
  "QUALIFIED",
  "VIEWING",
  "NEGOTIATION",
  "ON_HOLD",
];

function normalizeToken(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Æ/g, "AE")
    .replace(/Ø/g, "O")
    .replace(/Å/g, "A")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeForecastStage(value: unknown): ForecastStage {
  const token = normalizeToken(value);
  if (["WON", "VUNNET", "SOLGT", "SOLD", "CLOSED_WON", "CLOSED", "COMPLETED", "CUSTOMER", "KUNDE", "VIP"].includes(token)) return "WON";
  if (["LOST", "TAPT", "CLOSED_LOST"].includes(token)) return "LOST";
  if (["CONTACT", "CONTACTED", "KONTAKT", "KONTAKTET"].includes(token)) return "CONTACT";
  if (["QUALIFIED", "KVALIFISERT"].includes(token)) return "QUALIFIED";
  if (["VIEWING", "VISNING"].includes(token)) return "VIEWING";
  if (["NEGOTIATION", "FORHANDLING", "RESERVATION", "RESERVASJON"].includes(token)) return "NEGOTIATION";
  if (["ON_HOLD", "HOLD", "PA_VENT", "PAA_VENT"].includes(token)) return "ON_HOLD";
  return "NEW";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function staleThreshold(stage: ForecastStage) {
  if (stage === "NEGOTIATION") return 14;
  if (stage === "VIEWING") return 21;
  if (stage === "QUALIFIED") return 30;
  if (stage === "ON_HOLD") return 90;
  return 45;
}

function expectedWindow(stage: ForecastStage) {
  if (stage === "NEGOTIATION") return "0–30 dager";
  if (stage === "VIEWING") return "30–60 dager";
  if (stage === "QUALIFIED") return "60–90 dager";
  if (stage === "ON_HOLD") return "Ikke planlagt";
  return "90+ dager";
}

function probability30(stage: ForecastStage) {
  const probabilities: Record<ForecastStage, number> = {
    NEW: 0.01,
    CONTACT: 0.03,
    QUALIFIED: 0.08,
    VIEWING: 0.25,
    NEGOTIATION: 0.7,
    ON_HOLD: 0.02,
    WON: 1,
    LOST: 0,
  };
  return probabilities[stage];
}

function probability90(stage: ForecastStage) {
  const probabilities: Record<ForecastStage, number> = {
    NEW: 0.05,
    CONTACT: 0.12,
    QUALIFIED: 0.35,
    VIEWING: 0.65,
    NEGOTIATION: 0.9,
    ON_HOLD: 0.08,
    WON: 1,
    LOST: 0,
  };
  return probabilities[stage];
}

function brandIdFor(contact: ForecastContactInput) {
  return String(contact.brand_id || contact.brand || "zeneco").trim().toLowerCase() || "zeneco";
}

function lifecycleDate(contact: ForecastContactInput, stage: ForecastStage) {
  if (stage === "WON") return safeDate(contact.won_at || contact.closed_at || contact.sale_date || contact.updated_at || contact.created_at);
  if (stage === "LOST") return safeDate(contact.lost_at || contact.closed_at || contact.updated_at || contact.created_at);
  return safeDate(contact.created_at || contact.updated_at);
}

function activityDate(contact: ForecastContactInput) {
  return safeDate(contact.last_contact || contact.updated_at || contact.created_at);
}

export function buildForecastDeal(contact: ForecastContactInput, now = new Date()): ForecastDeal | null {
  const stage = normalizeForecastStage(contact.pipeline_status || contact.status || contact.stage);
  if (!ACTIVE_STAGES.has(stage)) return null;

  const dealValue = Math.max(0, numberValue(contact.pipeline_value) || numberValue(contact.sale_price));
  const explicitCommission = Math.max(0, numberValue(contact.commission_amount));
  const suppliedRate = numberValue(contact.commission_percent);
  const validRate = suppliedRate > 0 && suppliedRate <= 100;
  const commissionRate = validRate ? suppliedRate : FALLBACK_COMMISSION_PERCENT;
  const commissionRateEstimated = !validRate && explicitCommission <= 0;
  const grossCommission = explicitCommission > 0 ? explicitCommission : dealValue * (commissionRate / 100);
  const probability = STAGE_PROBABILITIES[stage];

  const created = lifecycleDate(contact, stage) || now;
  const lastActivity = activityDate(contact) || created;
  const nextFollowup = safeDate(contact.next_followup);
  const ageDays = daysBetween(created, now);
  const staleDays = daysBetween(lastActivity, now);
  const overdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime());
  const missingNextFollowup = !nextFollowup;
  const missingValue = dealValue <= 0;
  const missingContactChannel = !String(contact.email || "").trim() && !String(contact.phone || "").trim();
  const stale = staleDays >= staleThreshold(stage);

  const issues: string[] = [];
  if (overdue) issues.push("Oppfølgingen er forsinket");
  else if (missingNextFollowup) issues.push("Neste oppfølging er ikke satt");
  if (stale) issues.push(`Ingen registrert aktivitet på ${staleDays} dager`);
  if (missingValue) issues.push("Boligverdi mangler");
  if (missingContactChannel) issues.push("Gyldig kontaktkanal mangler");
  if (commissionRateEstimated) issues.push(`Provisjon estimert med ${FALLBACK_COMMISSION_PERCENT} % reserve`);

  let healthScore = 100;
  if (overdue) healthScore -= 30;
  else if (missingNextFollowup) healthScore -= 15;
  if (stale) healthScore -= 25;
  if (missingValue) healthScore -= 20;
  if (missingContactChannel) healthScore -= 20;
  if (commissionRateEstimated) healthScore -= 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const risk: ForecastRisk = healthScore <= 45 || (stage === "NEGOTIATION" && overdue)
    ? "HIGH"
    : healthScore <= 70
      ? "MEDIUM"
      : "LOW";

  let recommendedAction = "Hold fremdriften med avtalt neste oppfølging.";
  if (missingContactChannel) recommendedAction = "Finn og registrer en gyldig kontaktkanal.";
  else if (overdue) recommendedAction = "Ta den forsinkede oppfølgingen og sett en ny konkret dato.";
  else if (stale) recommendedAction = "Gjenoppta dialogen og avklar om kjøpsbehovet fortsatt er aktivt.";
  else if (missingValue) recommendedAction = "Registrer realistisk boligverdi og provisjonsgrunnlag.";
  else if (missingNextFollowup) recommendedAction = "Sett neste oppfølging med dato og ønsket resultat.";
  else if (commissionRateEstimated) recommendedAction = "Registrer avtalt provisjonssats for mer presis prognose.";

  return {
    id: contact.id,
    name: String(contact.name || contact.email || "Ukjent kontakt"),
    stage,
    brandId: brandIdFor(contact),
    dealValue,
    commissionRate,
    commissionRateEstimated,
    grossCommission,
    probability,
    weightedValue: dealValue * probability,
    weightedCommission: grossCommission * probability,
    forecast30Commission: grossCommission * probability30(stage),
    forecast90Commission: grossCommission * probability90(stage),
    ageDays,
    staleDays,
    stale,
    overdue,
    missingNextFollowup,
    missingValue,
    missingContactChannel,
    healthScore,
    risk,
    issues,
    recommendedAction,
    nextFollowupAt: nextFollowup?.toISOString() || null,
    expectedWindow: expectedWindow(stage),
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

function wonCommission(contact: ForecastContactInput) {
  const explicit = Math.max(0, numberValue(contact.commission_amount));
  if (explicit > 0) return explicit;
  const value = Math.max(0, numberValue(contact.sale_price) || numberValue(contact.pipeline_value));
  const rate = numberValue(contact.commission_percent);
  return value * ((rate > 0 && rate <= 100 ? rate : FALLBACK_COMMISSION_PERCENT) / 100);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function scenarioCommission(deals: ForecastDeal[], multiplier: number) {
  return deals.reduce((sum, deal) => sum + deal.grossCommission * Math.min(1, Math.max(0, deal.probability * multiplier)), 0);
}

function stageSummaries(deals: ForecastDeal[]): ForecastStageSummary[] {
  return STAGE_ORDER.map((stage) => {
    const rows = deals.filter((deal) => deal.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      probability: STAGE_PROBABILITIES[stage],
      count: rows.length,
      rawValue: rows.reduce((sum, row) => sum + row.dealValue, 0),
      weightedValue: rows.reduce((sum, row) => sum + row.weightedValue, 0),
      weightedCommission: rows.reduce((sum, row) => sum + row.weightedCommission, 0),
      averageAgeDays: Math.round(average(rows.map((row) => row.ageDays))),
      staleCount: rows.filter((row) => row.stale).length,
      overdueCount: rows.filter((row) => row.overdue).length,
      missingValueCount: rows.filter((row) => row.missingValue).length,
    };
  });
}

function sortDeals(deals: ForecastDeal[]) {
  const riskWeight: Record<ForecastRisk, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return [...deals].sort((a, b) => {
    const riskDelta = riskWeight[b.risk] - riskWeight[a.risk];
    if (riskDelta) return riskDelta;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (b.weightedCommission !== a.weightedCommission) return b.weightedCommission - a.weightedCommission;
    return a.healthScore - b.healthScore;
  });
}

export function buildRevenueForecast(contacts: ForecastContactInput[], now = new Date()): RevenueForecast {
  const deals = sortDeals(
    contacts
      .map((contact) => buildForecastDeal(contact, now))
      .filter(Boolean) as ForecastDeal[],
  );
  const won = contacts.filter((contact) => normalizeForecastStage(contact.pipeline_status || contact.status || contact.stage) === "WON");
  const lost = contacts.filter((contact) => normalizeForecastStage(contact.pipeline_status || contact.status || contact.stage) === "LOST");
  const wonCommissionRows = won.map((contact) => ({
    brandId: brandIdFor(contact),
    amount: wonCommission(contact),
    paid: Boolean(contact.commission_paid_date),
  }));

  const stages = stageSummaries(deals);
  const bottleneck = stages
    .filter((stage) => stage.count > 0)
    .sort((a, b) => (b.staleCount * 2 + b.overdueCount * 3 + b.missingValueCount) - (a.staleCount * 2 + a.overdueCount * 3 + a.missingValueCount))[0];

  const brandIds = new Set<string>([
    ...deals.map((deal) => deal.brandId),
    ...wonCommissionRows.map((row) => row.brandId),
  ]);
  const brands: ForecastBrandSummary[] = [...brandIds].map((brandId) => {
    const active = deals.filter((deal) => deal.brandId === brandId);
    const wonRows = wonCommissionRows.filter((row) => row.brandId === brandId);
    return {
      brandId,
      activeCount: active.length,
      openValue: active.reduce((sum, deal) => sum + deal.dealValue, 0),
      weightedValue: active.reduce((sum, deal) => sum + deal.weightedValue, 0),
      weightedCommission: active.reduce((sum, deal) => sum + deal.weightedCommission, 0),
      wonCommission: wonRows.reduce((sum, row) => sum + row.amount, 0),
      unpaidWonCommission: wonRows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0),
      atRiskCount: active.filter((deal) => deal.risk === "HIGH").length,
    };
  }).sort((a, b) => b.weightedCommission - a.weightedCommission);

  const dataChecks = deals.length * 4;
  const completedChecks = deals.reduce((sum, deal) => sum
    + (deal.dealValue > 0 ? 1 : 0)
    + (!deal.commissionRateEstimated ? 1 : 0)
    + (!deal.missingNextFollowup ? 1 : 0)
    + (!deal.missingContactChannel ? 1 : 0), 0);
  const dataQualityScore = dataChecks > 0 ? Math.round((completedChecks / dataChecks) * 100) : 100;
  const registeredOutcomes = won.length + lost.length;

  const weightedCommission = deals.reduce((sum, deal) => sum + deal.weightedCommission, 0);

  return {
    generatedAt: now.toISOString(),
    assumptions: {
      fallbackCommissionPercent: FALLBACK_COMMISSION_PERCENT,
      stageProbabilities: STAGE_PROBABILITIES,
      note: "Prognosen er en intern beslutningsstøtte basert på registrert pipeline-status. Den er ikke en garanti for salg eller provisjon.",
    },
    summary: {
      activeDeals: deals.length,
      openPipelineValue: deals.reduce((sum, deal) => sum + deal.dealValue, 0),
      weightedPipelineValue: deals.reduce((sum, deal) => sum + deal.weightedValue, 0),
      weightedCommission,
      forecast30Commission: deals.reduce((sum, deal) => sum + deal.forecast30Commission, 0),
      forecast90Commission: deals.reduce((sum, deal) => sum + deal.forecast90Commission, 0),
      wonDeals: won.length,
      lostDeals: lost.length,
      registeredOutcomeWinRate: registeredOutcomes > 0 ? won.length / registeredOutcomes : null,
      wonCommission: wonCommissionRows.reduce((sum, row) => sum + row.amount, 0),
      unpaidWonCommission: wonCommissionRows.filter((row) => !row.paid).reduce((sum, row) => sum + row.amount, 0),
      atRiskDeals: deals.filter((deal) => deal.risk === "HIGH").length,
      overdueDeals: deals.filter((deal) => deal.overdue).length,
      staleDeals: deals.filter((deal) => deal.stale).length,
      missingValueDeals: deals.filter((deal) => deal.missingValue).length,
      missingNextFollowupDeals: deals.filter((deal) => deal.missingNextFollowup).length,
      dataQualityScore,
      bottleneckStage: bottleneck && (bottleneck.staleCount > 0 || bottleneck.overdueCount > 0 || bottleneck.missingValueCount > 0) ? bottleneck.stage : null,
    },
    scenarios: {
      conservativeCommission: scenarioCommission(deals, 0.65),
      baseCommission: weightedCommission,
      upsideCommission: scenarioCommission(deals, 1.35),
    },
    stages,
    brands,
    deals,
  };
}
