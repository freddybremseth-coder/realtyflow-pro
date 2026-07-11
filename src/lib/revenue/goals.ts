import { approvalSummary, buildApprovalQueue } from "@/lib/approvals";
import { buildClosingOpportunity } from "@/lib/revenue/closing";
import { buildCommissionCollection } from "@/lib/revenue/commissions";
import { buildRevenueForecast } from "@/lib/revenue/forecast";
import { buildRecoveryWorkspace } from "@/lib/revenue/recovery";
import { buildServiceRevenueWorkspace } from "@/lib/revenue/service-revenue";

export const REVENUE_GOAL_SCOPES = ["all", "zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type RevenueGoalScope = (typeof REVENUE_GOAL_SCOPES)[number];
export type GoalStatus = "UNSET" | "ACHIEVED" | "ON_TRACK" | "AT_RISK" | "BEHIND";

export interface RevenueGoalConfig {
  scope: RevenueGoalScope;
  periodStart: string;
  commissionTargetEur: number | null;
  closedDealsTarget: number | null;
  keyholdingMrrTargetEur: number | null;
  keyholdingContractsTarget: number | null;
  recoveredLeadsTarget: number | null;
  notes: string | null;
  updatedAt: string | null;
}

export interface RevenueGoalInput {
  contacts: any[];
  config: RevenueGoalConfig;
  profiles?: any[];
  shortlists?: any[];
  presentations?: any[];
  messageDrafts?: any[];
  warnings?: string[];
}

export interface GoalMetric {
  id: "commission" | "deals" | "keyholding-mrr" | "keyholding-contracts" | "recovery";
  label: string;
  unit: "EUR" | "COUNT";
  target: number | null;
  actual: number;
  projected: number | null;
  progressPercent: number | null;
  expectedPace: number | null;
  gap: number | null;
  status: GoalStatus;
  detail: string;
}

export interface WeeklyPlanItem {
  id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM";
  title: string;
  description: string;
  targetThisWeek: number | null;
  unit: "EUR" | "COUNT" | null;
  href: string;
}

export interface RevenueGoalScorecard {
  generatedAt: string;
  configured: boolean;
  config: RevenueGoalConfig;
  period: {
    start: string;
    end: string;
    elapsedPercent: number;
    daysRemaining: number;
    weeksRemaining: number;
  };
  headline: string;
  summary: {
    earnedCommission: number;
    collectedCommission: number;
    forecast30Commission: number;
    wonDeals: number;
    currentKeyholdingMrr: number;
    currentKeyholdingArr: number;
    newKeyholdingContracts: number;
    recoveredLeads: number;
    overdueCommission: number;
    highRiskClosings: number;
    approvalReady: number;
    dataQualityScore: number;
  };
  metrics: GoalMetric[];
  weeklyPlan: WeeklyPlanItem[];
  warnings: string[];
  assumptions: string[];
  safety: {
    goalsAreUserDefined: true;
    automaticActions: false;
    automaticSending: false;
  };
}

const REAL_ESTATE_BRANDS = new Set(["zeneco", "soleada", "pinosoecolife"]);
const KEYHOLDING_SOURCE_BRANDS = new Set(["zeneco", "soleada", "keyholding"]);
const DAY_MS = 86_400_000;

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, value) : 0;
  if (typeof value !== "string") return 0;
  const parsed = Number(value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function brandId(contact: any) {
  return String(contact?.brand_id || contact?.brand || "").trim().toLowerCase();
}

function interactions(contact: any) {
  return Array.isArray(contact?.interactions) ? contact.interactions : [];
}

function actionOf(item: any) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return String(item?.action || metadata.action || "").trim().toLowerCase();
}

function interactionDate(item: any) {
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return safeDate(item?.date || item?.created_at || item?.timestamp || metadata.at);
}

function hasKeyholdingSignal(contact: any) {
  return brandId(contact) === "keyholding" || interactions(contact).some((item: any) => actionOf(item).startsWith("keyholding_"));
}

function startOfMonth(value: string) {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2024 || year > 2040 || month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function inPeriod(value: string | null | undefined, start: Date, end: Date) {
  const date = safeDate(value);
  return Boolean(date && date.getTime() >= start.getTime() && date.getTime() < end.getTime());
}

function scopedRealEstateContacts(contacts: any[], scope: RevenueGoalScope) {
  if (scope === "keyholding") return [];
  if (scope === "all") {
    return contacts.filter((contact) => {
      const brand = brandId(contact);
      return !brand || REAL_ESTATE_BRANDS.has(brand);
    });
  }
  return contacts.filter((contact) => brandId(contact) === scope);
}

function scopedServiceContacts(contacts: any[], scope: RevenueGoalScope) {
  const eligible = contacts.filter((contact) => KEYHOLDING_SOURCE_BRANDS.has(brandId(contact)) || hasKeyholdingSignal(contact));
  if (scope === "all" || scope === "keyholding") return eligible;
  if (scope === "pinosoecolife") return [];
  return eligible.filter((contact) => brandId(contact) === scope);
}

function filterRowsByScope(rows: any[], scope: RevenueGoalScope) {
  if (scope === "all") return rows;
  return rows.filter((row) => String(row?.brand || row?.brand_id || "").trim().toLowerCase() === scope);
}

function statusFor(target: number | null, actual: number, projected: number | null, elapsed: number): GoalStatus {
  if (!target || target <= 0) return "UNSET";
  if (actual >= target) return "ACHIEVED";
  const expected = target * elapsed;
  if (projected !== null && projected >= target && actual >= expected * 0.7) return "ON_TRACK";
  if (actual >= expected * 0.9) return "ON_TRACK";
  if (actual < expected * 0.6) return "BEHIND";
  return "AT_RISK";
}

function metric(
  id: GoalMetric["id"],
  label: string,
  unit: GoalMetric["unit"],
  target: number | null,
  actual: number,
  projected: number | null,
  elapsed: number,
  detail: string,
): GoalMetric {
  return {
    id,
    label,
    unit,
    target,
    actual,
    projected,
    progressPercent: target && target > 0 ? Math.round((actual / target) * 100) : null,
    expectedPace: target && target > 0 ? target * elapsed : null,
    gap: target && target > 0 ? Math.max(0, target - actual) : null,
    status: statusFor(target, actual, projected, elapsed),
    detail,
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function configured(config: RevenueGoalConfig) {
  return [
    config.commissionTargetEur,
    config.closedDealsTarget,
    config.keyholdingMrrTargetEur,
    config.keyholdingContractsTarget,
    config.recoveredLeadsTarget,
  ].some((value) => numberValue(value) > 0);
}

export function revenueGoalStorageKey(scope: RevenueGoalScope, periodStart: string) {
  const month = periodStart.slice(0, 7);
  return `revenue-goals:${scope}:${month}`;
}

export function emptyRevenueGoalConfig(scope: RevenueGoalScope, month: string): RevenueGoalConfig {
  return {
    scope,
    periodStart: `${month.slice(0, 7)}-01`,
    commissionTargetEur: null,
    closedDealsTarget: null,
    keyholdingMrrTargetEur: null,
    keyholdingContractsTarget: null,
    recoveredLeadsTarget: null,
    notes: null,
    updatedAt: null,
  };
}

export function buildRevenueGoalScorecard(input: RevenueGoalInput, now = new Date()): RevenueGoalScorecard {
  const start = startOfMonth(input.config.periodStart) || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const elapsedDays = now.getTime() <= start.getTime()
    ? 0
    : now.getTime() >= end.getTime()
      ? totalDays
      : Math.max(0, (now.getTime() - start.getTime()) / DAY_MS);
  const elapsed = Math.max(0, Math.min(1, elapsedDays / totalDays));
  const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));

  const realEstateContacts = scopedRealEstateContacts(input.contacts || [], input.config.scope);
  const serviceContacts = scopedServiceContacts(input.contacts || [], input.config.scope);
  const forecast = buildRevenueForecast(realEstateContacts, now);
  const commissions = buildCommissionCollection(realEstateContacts, now);
  const recovery = buildRecoveryWorkspace(realEstateContacts, now);
  const services = buildServiceRevenueWorkspace(serviceContacts, now);
  const closing = realEstateContacts
    .map((contact) => buildClosingOpportunity(contact, now))
    .filter(Boolean) as NonNullable<ReturnType<typeof buildClosingOpportunity>>[];

  const profiles = filterRowsByScope(input.profiles || [], input.config.scope);
  const profileIds = new Set(profiles.map((row) => String(row.id)));
  const approvals = buildApprovalQueue({
    contacts: input.contacts || [],
    profiles,
    shortlists: filterRowsByScope(input.shortlists || [], input.config.scope).filter((row) => input.config.scope === "all" || profileIds.has(String(row.buyer_profile_id))),
    presentations: filterRowsByScope(input.presentations || [], input.config.scope).filter((row) => input.config.scope === "all" || profileIds.has(String(row.buyer_profile_id))),
    messageDrafts: filterRowsByScope(input.messageDrafts || [], input.config.scope).filter((row) => input.config.scope === "all" || profileIds.has(String(row.buyer_profile_id))),
  }, now);
  const approvalStats = approvalSummary(approvals);

  const periodCases = commissions.cases.filter((item) => inPeriod(item.wonAt, start, end));
  const earnedCommission = periodCases
    .filter((item) => item.commissionConfirmed)
    .reduce((sum, item) => sum + item.commissionAmount, 0);
  const collectedCommission = commissions.cases
    .filter((item) => item.commissionConfirmed && inPeriod(item.paidAt, start, end))
    .reduce((sum, item) => sum + item.commissionAmount, 0);
  const wonDeals = periodCases.length;
  const newKeyholdingContracts = services.accounts.filter((item) => inPeriod(item.startedAt, start, end)).length;
  const recoveredLeads = realEstateContacts.filter((contact) => interactions(contact).some((item: any) => actionOf(item) === "recovery_reactivated" && inPeriod(interactionDate(item)?.toISOString(), start, end))).length;

  const commissionProjected = earnedCommission + forecast.summary.forecast30Commission;
  const projectedDeals = wonDeals + forecast.deals.reduce((sum, deal) => sum + deal.probability, 0);
  const metrics: GoalMetric[] = [
    metric(
      "commission",
      "Opptjent provisjon",
      "EUR",
      input.config.commissionTargetEur,
      earnedCommission,
      commissionProjected,
      elapsed,
      "Faktisk opptjent provisjon bruker bare bekreftede vilkår. Projeksjonen legger til den eksisterende 30-dagers prognosen.",
    ),
    metric(
      "deals",
      "Vunne boligsalg",
      "COUNT",
      input.config.closedDealsTarget,
      wonDeals,
      projectedDeals,
      elapsed,
      "Projisert antall bruker registrerte stage-sannsynligheter og er ikke en salgsgaranti.",
    ),
    metric(
      "keyholding-mrr",
      "Keyholding MRR",
      "EUR",
      input.config.keyholdingMrrTargetEur,
      services.summary.monthlyRecurringRevenue,
      null,
      elapsed,
      `${services.summary.potentialMonthlyRevenue.toFixed(0)} EUR i tillegg er registrert som potensielt, ikke faktisk MRR.`,
    ),
    metric(
      "keyholding-contracts",
      "Nye Keyholding-avtaler",
      "COUNT",
      input.config.keyholdingContractsTarget,
      newKeyholdingContracts,
      null,
      elapsed,
      `${services.summary.offersOutstanding} presenterte tilbud er fortsatt uavklart.`,
    ),
    metric(
      "recovery",
      "Reaktiverte leads",
      "COUNT",
      input.config.recoveredLeadsTarget,
      recoveredLeads,
      null,
      elapsed,
      `${recovery.summary.recoverNow} dormant leads er vurdert som aktuelle for kontrollert gjenopptakelse.`,
    ),
  ];

  const weeklyPlan: WeeklyPlanItem[] = [];
  const commissionMetric = metrics.find((item) => item.id === "commission")!;
  const dealsMetric = metrics.find((item) => item.id === "deals")!;
  const mrrMetric = metrics.find((item) => item.id === "keyholding-mrr")!;
  const contractsMetric = metrics.find((item) => item.id === "keyholding-contracts")!;
  const recoveryMetric = metrics.find((item) => item.id === "recovery")!;

  if (commissions.summary.overdueOutstandingCommission > 0) {
    weeklyPlan.push({
      id: "collect-overdue",
      priority: "CRITICAL",
      title: "Følg opp forfalt provisjon",
      description: `${commissions.summary.overdueCount} saker har forfalt provisjon. Kontantstrøm prioriteres foran nye prognoser.`,
      targetThisWeek: commissions.summary.overdueOutstandingCommission,
      unit: "EUR",
      href: "/commissions",
    });
  }
  const highRiskClosings = closing.filter((item) => item.risk === "HIGH").length;
  if (highRiskClosings > 0) {
    weeklyPlan.push({
      id: "protect-closings",
      priority: "CRITICAL",
      title: "Beskytt closing-saker med høy risiko",
      description: "Avklar neste konkrete steg, beslutningstakere og kritiske blokkeringer.",
      targetThisWeek: highRiskClosings,
      unit: "COUNT",
      href: "/closing",
    });
  }
  if (commissionMetric.gap && commissionMetric.gap > 0) {
    weeklyPlan.push({
      id: "commission-pace",
      priority: commissionMetric.status === "BEHIND" ? "HIGH" : "MEDIUM",
      title: "Hold nødvendig provisjonstakt",
      description: `Fordelt på gjenstående uker må pipeline støtte omtrent ${(commissionMetric.gap / weeksRemaining).toFixed(0)} EUR i ny opptjent provisjon per uke.`,
      targetThisWeek: commissionMetric.gap / weeksRemaining,
      unit: "EUR",
      href: "/forecast",
    });
  }
  if (dealsMetric.gap && dealsMetric.gap > 0) {
    weeklyPlan.push({
      id: "deal-pace",
      priority: dealsMetric.status === "BEHIND" ? "HIGH" : "MEDIUM",
      title: "Flytt nok salg mot closing",
      description: "Bruk Closing Workspace til å velge de mest realistiske sakene, ikke bare flest mulige saker.",
      targetThisWeek: Math.max(1, Math.ceil(dealsMetric.gap / weeksRemaining)),
      unit: "COUNT",
      href: "/closing",
    });
  }
  if (mrrMetric.gap && mrrMetric.gap > 0) {
    const averageRecommendedMrr = average(services.accounts
      .filter((item) => !["ACTIVE", "RENEWAL_DUE", "CANCELLED"].includes(item.lifecycle))
      .map((item) => item.potentialMonthlyRevenue)
      .filter((value) => value > 0)) || 89;
    const contractsNeeded = Math.ceil(mrrMetric.gap / averageRecommendedMrr);
    weeklyPlan.push({
      id: "mrr-pace",
      priority: mrrMetric.status === "BEHIND" ? "HIGH" : "MEDIUM",
      title: "Bygg Keyholding MRR",
      description: `MRR-gapet tilsvarer omtrent ${contractsNeeded} avtaler basert på gjennomsnittlig anbefalt plan i den aktuelle kundemassen.`,
      targetThisWeek: Math.max(1, Math.ceil(contractsNeeded / weeksRemaining)),
      unit: "COUNT",
      href: "/service-revenue",
    });
  }
  if (contractsMetric.gap && contractsMetric.gap > 0 && !weeklyPlan.some((item) => item.id === "mrr-pace")) {
    weeklyPlan.push({
      id: "contract-pace",
      priority: contractsMetric.status === "BEHIND" ? "HIGH" : "MEDIUM",
      title: "Følg opp Keyholding-avtaler",
      description: "Presenter tilbud manuelt og registrer bare avtaler som faktisk er startet.",
      targetThisWeek: Math.max(1, Math.ceil(contractsMetric.gap / weeksRemaining)),
      unit: "COUNT",
      href: "/service-revenue",
    });
  }
  if (recoveryMetric.gap && recoveryMetric.gap > 0) {
    weeklyPlan.push({
      id: "recovery-pace",
      priority: recoveryMetric.status === "BEHIND" ? "HIGH" : "MEDIUM",
      title: "Reaktiver relevante dormant leads",
      description: "Bruk bare leads med tydelig recovery-potensial og registrer utfallet manuelt.",
      targetThisWeek: Math.max(1, Math.ceil(recoveryMetric.gap / weeksRemaining)),
      unit: "COUNT",
      href: "/recovery",
    });
  }
  if (approvalStats.ready > 0) {
    weeklyPlan.push({
      id: "clear-approvals",
      priority: approvalStats.ready >= 5 ? "HIGH" : "MEDIUM",
      title: "Fjern godkjenningskøen",
      description: "Godkjenn bare etter kontroll; Approval Center sender fortsatt ingenting.",
      targetThisWeek: approvalStats.ready,
      unit: "COUNT",
      href: "/approvals",
    });
  }
  if (forecast.summary.dataQualityScore < 80) {
    weeklyPlan.push({
      id: "data-quality",
      priority: forecast.summary.dataQualityScore < 60 ? "HIGH" : "MEDIUM",
      title: "Forbedre CRM-datakvaliteten",
      description: "Registrer boligverdi, provisjonsvilkår, kontaktkanal og neste oppfølging på aktive saker.",
      targetThisWeek: 80 - forecast.summary.dataQualityScore,
      unit: "COUNT",
      href: "/forecast",
    });
  }

  const priorityWeight = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
  weeklyPlan.sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority]);

  const isConfigured = configured(input.config);
  const achieved = metrics.filter((item) => item.status === "ACHIEVED").length;
  const atRisk = metrics.filter((item) => item.status === "AT_RISK" || item.status === "BEHIND").length;
  let headline = "Sett månedens mål for å få en konkret ukeplan.";
  if (isConfigured && commissions.summary.overdueOutstandingCommission > 0) headline = "Beskytt kontantstrømmen først: forfalt provisjon krever handling.";
  else if (isConfigured && atRisk > 0) headline = `${atRisk} mål ligger bak eller er i risiko. Bruk ukeplanen til å lukke gapet.`;
  else if (isConfigured && achieved === metrics.filter((item) => item.status !== "UNSET").length) headline = "Alle satte mål er nådd. Beskytt kvalitet og dokumenter resultatene.";
  else if (isConfigured) headline = "Målene er satt. Følg uketakten og prioriter kvalitet i de nærmeste salgsstegene.";

  return {
    generatedAt: now.toISOString(),
    configured: isConfigured,
    config: input.config,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      elapsedPercent: Math.round(elapsed * 100),
      daysRemaining,
      weeksRemaining,
    },
    headline,
    summary: {
      earnedCommission,
      collectedCommission,
      forecast30Commission: forecast.summary.forecast30Commission,
      wonDeals,
      currentKeyholdingMrr: services.summary.monthlyRecurringRevenue,
      currentKeyholdingArr: services.summary.annualRecurringRevenue,
      newKeyholdingContracts,
      recoveredLeads,
      overdueCommission: commissions.summary.overdueOutstandingCommission,
      highRiskClosings,
      approvalReady: approvalStats.ready,
      dataQualityScore: forecast.summary.dataQualityScore,
    },
    metrics,
    weeklyPlan: weeklyPlan.slice(0, 8),
    warnings: input.warnings || [],
    assumptions: [
      "Opptjent provisjon teller bare vunne saker med bekreftet provisjonsbeløp eller sats.",
      "30-dagers provisjon og projiserte salg er beslutningsstøtte, ikke garanti.",
      "Keyholding MRR teller bare aktive eller fornyelsesklare avtaler.",
      "Reaktiverte leads telles bare når recovery_reactivated er logget i perioden.",
    ],
    safety: {
      goalsAreUserDefined: true,
      automaticActions: false,
      automaticSending: false,
    },
  };
}
