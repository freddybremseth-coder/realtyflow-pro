import {
  buildAttributionWorkspace,
  type AttributionScope,
  type AttributionSpendEntry,
} from "@/lib/revenue/attribution";
import {
  buildCommissionCollection,
  type CommissionCase,
  type CommissionContactInput,
} from "@/lib/revenue/commissions";
import {
  KEYHOLDING_PLAN_MONTHLY_EUR,
  buildServiceRevenueWorkspace,
  type KeyholdingPlan,
  type ServiceContactInput,
} from "@/lib/revenue/service-revenue";

export const MONTHLY_CLOSE_SCOPES = ["all", "zeneco", "soleada", "pinosoecolife", "keyholding"] as const;
export type MonthlyCloseScope = (typeof MONTHLY_CLOSE_SCOPES)[number];
export type MonthlyCloseStatus = "IN_PROGRESS" | "REVIEW_REQUIRED" | "READY_TO_CLOSE";
export type CloseCheckStatus = "PASS" | "WARNING" | "BLOCKED" | "INFO";

export interface MonthlyCloseGoalConfig {
  commissionTargetEur: number | null;
  closedDealsTarget: number | null;
  keyholdingMrrTargetEur: number | null;
  keyholdingContractsTarget: number | null;
  recoveredLeadsTarget: number | null;
  notes?: string | null;
  updatedAt?: string | null;
}

export interface MonthlyCloseInput {
  contacts: Array<CommissionContactInput & ServiceContactInput & Record<string, unknown>>;
  scope: MonthlyCloseScope;
  periodStart: string;
  spend?: AttributionSpendEntry[];
  goals?: MonthlyCloseGoalConfig | null;
  warnings?: string[];
  now?: Date;
}

export interface MonthlyCloseCheck {
  id: string;
  label: string;
  status: CloseCheckStatus;
  detail: string;
  href: string;
}

export interface MonthlyCloseDealRow {
  id: string;
  name: string;
  brandId: string;
  wonAt: string | null;
  invoiceSentAt: string | null;
  paidAt: string | null;
  invoiceNumber: string | null;
  dealValue: number;
  commissionAmount: number;
  commissionConfirmed: boolean;
  earnedInPeriod: boolean;
  invoicedInPeriod: boolean;
  collectedInPeriod: boolean;
  currentStatus: CommissionCase["status"];
  href: string;
}

export interface MonthlyCloseBrandRow {
  brandId: string;
  wonDeals: number;
  dealValue: number;
  earnedCommission: number;
  invoicedCommission: number;
  collectedCommission: number;
  estimatedCommissionExcluded: number;
}

export interface MonthlyCloseGoalRow {
  id: "commission" | "deals" | "keyholding-mrr" | "keyholding-contracts" | "recovery";
  label: string;
  target: number | null;
  actual: number;
  unit: "EUR" | "COUNT";
  progressPercent: number | null;
  status: "UNSET" | "ACHIEVED" | "ON_TRACK" | "AT_RISK" | "BEHIND";
}

export interface MonthlyCloseReport {
  generatedAt: string;
  scope: MonthlyCloseScope;
  period: {
    start: string;
    end: string;
    month: string;
    elapsedPercent: number;
    isComplete: boolean;
  };
  closeStatus: MonthlyCloseStatus;
  headline: string;
  summary: {
    wonDeals: number;
    dealValue: number;
    earnedCommission: number;
    estimatedCommissionExcluded: number;
    invoicedCommission: number;
    collectedCommission: number;
    currentOutstandingCommission: number;
    currentOverdueCommission: number;
    currentCollectionRate: number | null;
    marketingSpend: number;
    marketingContribution: number;
    cashAfterMarketing: number;
    cohortEarnedRoas: number | null;
    cohortCashRoas: number | null;
    monthEndKeyholdingMrr: number;
    monthEndKeyholdingArr: number;
    newKeyholdingContracts: number;
    renewedKeyholdingContracts: number;
    pausedKeyholdingContracts: number;
    cancelledKeyholdingContracts: number;
    recoveredLeads: number;
  };
  commission: {
    earnedWithoutInvoiceCount: number;
    paidWithoutInvoiceNumberCount: number;
    missingTermsCount: number;
    currentOutstandingNote: string;
  };
  marketing: ReturnType<typeof buildAttributionWorkspace>;
  keyholding: {
    activeAtMonthEnd: number;
    missingPlanAtMonthEnd: number;
    currentMrr: number;
    currentArr: number;
    potentialCurrentMrr: number;
  };
  goals: MonthlyCloseGoalRow[];
  checks: MonthlyCloseCheck[];
  brands: MonthlyCloseBrandRow[];
  deals: MonthlyCloseDealRow[];
  warnings: string[];
  assumptions: string[];
  safety: {
    readOnly: true;
    accountingPosting: false;
    invoiceCreation: false;
    automaticSending: false;
  };
}

const REAL_ESTATE_BRANDS = new Set(["zeneco", "soleada", "pinosoecolife"]);
const SERVICE_SOURCE_BRANDS = new Set(["zeneco", "soleada", "keyholding"]);
const DAY_MS = 86_400_000;
const KEYHOLDING_ACTIONS = new Set([
  "keyholding_contract_started",
  "keyholding_contract_renewed",
  "keyholding_contract_paused",
  "keyholding_contract_cancelled",
]);

function clean(value: unknown) {
  return String(value || "").trim();
}

function token(value: unknown) {
  return clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

function monthRange(periodStart: string) {
  const match = /^(20(?:2[4-9]|3\d|40))-(0[1-9]|1[0-2])/.exec(periodStart);
  if (!match) throw new Error("Invalid monthly close period");
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end, month: `${match[1]}-${match[2]}` };
}

function inPeriod(value: string | null | undefined, start: Date, end: Date) {
  const date = safeDate(value);
  return Boolean(date && date >= start && date < end);
}

function brandId(contact: Record<string, unknown>) {
  return token(contact.brand_id || contact.brand || "zeneco") || "zeneco";
}

function interactions(contact: Record<string, unknown>) {
  return Array.isArray(contact.interactions) ? contact.interactions : [];
}

function interactionAction(item: unknown) {
  if (!item || typeof item !== "object") return "";
  const row = item as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object" ? metadataRecord(row.metadata) : {};
  return clean(row.action || metadata.action).toLowerCase();
}

function interactionDate(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object" ? metadataRecord(row.metadata) : {};
  return safeDate(row.date || row.created_at || row.timestamp || metadata.at || metadata.date);
}

function metadataRecord(value: object) {
  return value as Record<string, unknown>;
}

function scopedRealEstateContacts(contacts: MonthlyCloseInput["contacts"], scope: MonthlyCloseScope) {
  if (scope === "keyholding") return [];
  if (scope === "all") return contacts.filter((contact) => REAL_ESTATE_BRANDS.has(brandId(contact)) || !clean(contact.brand_id || contact.brand));
  return contacts.filter((contact) => brandId(contact) === scope);
}

function hasKeyholdingSignal(contact: Record<string, unknown>) {
  return brandId(contact) === "keyholding" || interactions(contact).some((item) => interactionAction(item).startsWith("keyholding_"));
}

function scopedServiceContacts(contacts: MonthlyCloseInput["contacts"], scope: MonthlyCloseScope) {
  const eligible = contacts.filter((contact) => SERVICE_SOURCE_BRANDS.has(brandId(contact)) || hasKeyholdingSignal(contact));
  if (scope === "all" || scope === "keyholding") return eligible;
  if (scope === "pinosoecolife") return [];
  return eligible.filter((contact) => brandId(contact) === scope);
}

function keyholdingPlan(value: unknown): KeyholdingPlan | null {
  const normalized = token(value);
  if (/premium|concierge|konsierge/.test(normalized)) return "PREMIUM";
  if (/standard|komplett/.test(normalized)) return "STANDARD";
  if (/basic|trygghet/.test(normalized)) return "BASIC";
  return null;
}

function keyholdingLifecycleAt(contact: Record<string, unknown>, at: Date) {
  const events = interactions(contact)
    .filter((item) => KEYHOLDING_ACTIONS.has(interactionAction(item)))
    .map((item) => {
      const row = item as Record<string, unknown>;
      const metadata = row.metadata && typeof row.metadata === "object" ? metadataRecord(row.metadata) : {};
      return {
        action: interactionAction(item),
        date: interactionDate(item),
        plan: keyholdingPlan(metadata.plan || metadata.keyholding_plan || row.plan || row.content),
      };
    })
    .filter((item) => item.date && item.date < at)
    .sort((a, b) => b.date!.getTime() - a.date!.getTime());
  const latest = events[0] || null;
  const active = Boolean(latest && ["keyholding_contract_started", "keyholding_contract_renewed"].includes(latest.action));
  const latestPlan = latest?.plan || events.find((item) => item.plan)?.plan || null;
  return { active, plan: latestPlan, latest };
}

function countKeyholdingEvents(contacts: MonthlyCloseInput["contacts"], action: string, start: Date, end: Date) {
  return contacts.filter((contact) => interactions(contact).some((item) => interactionAction(item) === action && inPeriod(interactionDate(item)?.toISOString(), start, end))).length;
}

function countRecoveredLeads(contacts: MonthlyCloseInput["contacts"], start: Date, end: Date) {
  return contacts.filter((contact) => interactions(contact).some((item) => interactionAction(item) === "recovery_reactivated" && inPeriod(interactionDate(item)?.toISOString(), start, end))).length;
}

function goalStatus(target: number | null, actual: number, elapsed: number): MonthlyCloseGoalRow["status"] {
  if (!target || target <= 0) return "UNSET";
  if (actual >= target) return "ACHIEVED";
  const expected = target * elapsed;
  if (actual >= expected * 0.9) return "ON_TRACK";
  if (actual < expected * 0.6) return "BEHIND";
  return "AT_RISK";
}

function goalRow(
  id: MonthlyCloseGoalRow["id"],
  label: string,
  target: number | null | undefined,
  actual: number,
  unit: MonthlyCloseGoalRow["unit"],
  elapsed: number,
): MonthlyCloseGoalRow {
  const normalizedTarget = target && target > 0 ? target : null;
  return {
    id,
    label,
    target: normalizedTarget,
    actual,
    unit,
    progressPercent: normalizedTarget ? Math.round((actual / normalizedTarget) * 100) : null,
    status: goalStatus(normalizedTarget, actual, elapsed),
  };
}

function sumCases(cases: CommissionCase[], predicate: (item: CommissionCase) => boolean) {
  return cases.filter((item) => item.commissionConfirmed && predicate(item)).reduce((sum, item) => sum + item.commissionAmount, 0);
}

function closeHeadline(status: MonthlyCloseStatus, blockers: number, warnings: number) {
  if (status === "IN_PROGRESS") return "Måneden pågår. Tallene er foreløpige og oppdateres når CRM-hendelser registreres.";
  if (status === "REVIEW_REQUIRED") return `${blockers} kritiske avvik må avklares før måneden kan anses som kontrollert.`;
  if (warnings > 0) return "Måneden kan avsluttes internt, men dokumenterte advarsler bør følges opp.";
  return "Månedsgrunnlaget er komplett nok for intern avslutning og videre regnskapskontroll.";
}

export function buildMonthlyCloseReport(input: MonthlyCloseInput): MonthlyCloseReport {
  const now = input.now || new Date();
  const { start, end, month } = monthRange(input.periodStart);
  const totalDays = Math.max(1, (end.getTime() - start.getTime()) / DAY_MS);
  const elapsed = now <= start ? 0 : now >= end ? 1 : (now.getTime() - start.getTime()) / (totalDays * DAY_MS);
  const realEstateContacts = scopedRealEstateContacts(input.contacts || [], input.scope);
  const serviceContacts = scopedServiceContacts(input.contacts || [], input.scope);
  const commissions = buildCommissionCollection(realEstateContacts, now);
  const services = buildServiceRevenueWorkspace(serviceContacts, now);
  const marketing = buildAttributionWorkspace({
    contacts: input.contacts || [],
    scope: input.scope as AttributionScope,
    periodStart: start.toISOString(),
    spend: input.spend || [],
    now,
    warnings: input.warnings || [],
  });

  const earnedCases = commissions.cases.filter((item) => inPeriod(item.wonAt, start, end));
  const activityCases = commissions.cases.filter((item) => inPeriod(item.wonAt, start, end) || inPeriod(item.invoiceSentAt, start, end) || inPeriod(item.paidAt, start, end));
  const earnedCommission = sumCases(earnedCases, () => true);
  const estimatedCommissionExcluded = earnedCases.filter((item) => item.commissionEstimated).reduce((sum, item) => sum + item.commissionAmount, 0);
  const invoicedCommission = sumCases(commissions.cases, (item) => inPeriod(item.invoiceSentAt, start, end));
  const collectedCommission = sumCases(commissions.cases, (item) => inPeriod(item.paidAt, start, end));
  const currentOutstandingCommission = sumCases(commissions.cases, (item) => ["INVOICED", "OVERDUE"].includes(item.status));
  const currentOverdueCommission = sumCases(commissions.cases, (item) => item.status === "OVERDUE");
  const dealValue = earnedCases.reduce((sum, item) => sum + item.dealValue, 0);
  const earnedWithoutInvoiceCount = earnedCases.filter((item) => item.commissionConfirmed && !item.invoiceSentAt).length;
  const paidWithoutInvoiceNumberCount = commissions.cases.filter((item) => inPeriod(item.paidAt, start, end) && !item.invoiceNumber).length;
  const missingTermsCount = earnedCases.filter((item) => !item.commissionConfirmed).length;

  let monthEndKeyholdingMrr = 0;
  let activeAtMonthEnd = 0;
  let missingPlanAtMonthEnd = 0;
  for (const contact of serviceContacts) {
    const state = keyholdingLifecycleAt(contact, end);
    if (!state.active) continue;
    activeAtMonthEnd += 1;
    if (!state.plan) missingPlanAtMonthEnd += 1;
    else monthEndKeyholdingMrr += KEYHOLDING_PLAN_MONTHLY_EUR[state.plan];
  }
  const newKeyholdingContracts = countKeyholdingEvents(serviceContacts, "keyholding_contract_started", start, end);
  const renewedKeyholdingContracts = countKeyholdingEvents(serviceContacts, "keyholding_contract_renewed", start, end);
  const pausedKeyholdingContracts = countKeyholdingEvents(serviceContacts, "keyholding_contract_paused", start, end);
  const cancelledKeyholdingContracts = countKeyholdingEvents(serviceContacts, "keyholding_contract_cancelled", start, end);
  const recoveredLeads = countRecoveredLeads(realEstateContacts, start, end);

  const goals = [
    goalRow("commission", "Opptjent provisjon", input.goals?.commissionTargetEur, earnedCommission, "EUR", elapsed),
    goalRow("deals", "Vunne boligsalg", input.goals?.closedDealsTarget, earnedCases.length, "COUNT", elapsed),
    goalRow("keyholding-mrr", "Keyholding MRR ved månedsslutt", input.goals?.keyholdingMrrTargetEur, monthEndKeyholdingMrr, "EUR", elapsed),
    goalRow("keyholding-contracts", "Nye Keyholding-avtaler", input.goals?.keyholdingContractsTarget, newKeyholdingContracts, "COUNT", elapsed),
    goalRow("recovery", "Reaktiverte leads", input.goals?.recoveredLeadsTarget, recoveredLeads, "COUNT", elapsed),
  ];

  const checks: MonthlyCloseCheck[] = [];
  checks.push({
    id: "period-complete",
    label: "Rapporteringsperioden er avsluttet",
    status: now >= end ? "PASS" : "INFO",
    detail: now >= end ? "Hele måneden er med i rapporten." : "Måneden pågår; tallene er foreløpige.",
    href: "/monthly-close",
  });
  checks.push({
    id: "commission-terms",
    label: "Provisjonsgrunnlag på månedens salg",
    status: missingTermsCount > 0 ? "BLOCKED" : "PASS",
    detail: missingTermsCount > 0 ? `${missingTermsCount} vunne salg mangler bekreftet beløp eller sats.` : "Alle månedens salg har bekreftet provisjonsgrunnlag.",
    href: "/commissions",
  });
  checks.push({
    id: "invoice-registration",
    label: "Fakturastatus er registrert",
    status: earnedWithoutInvoiceCount > 0 ? "WARNING" : "PASS",
    detail: earnedWithoutInvoiceCount > 0 ? `${earnedWithoutInvoiceCount} opptjente provisjoner er ikke registrert fakturert.` : "Alle opptjente provisjoner er registrert fakturert.",
    href: "/commissions",
  });
  checks.push({
    id: "payment-documentation",
    label: "Betalinger har fakturareferanse",
    status: paidWithoutInvoiceNumberCount > 0 ? "WARNING" : "PASS",
    detail: paidWithoutInvoiceNumberCount > 0 ? `${paidWithoutInvoiceNumberCount} innbetalinger mangler registrert fakturanummer.` : "Registrerte innbetalinger har fakturareferanse.",
    href: "/commissions",
  });
  checks.push({
    id: "marketing-spend",
    label: "Markedsføringskostnad er registrert",
    status: marketing.summary.totalSpendEur > 0 ? "PASS" : "WARNING",
    detail: marketing.summary.totalSpendEur > 0 ? `${marketing.summary.totalSpendEur.toFixed(0)} EUR er registrert for kohorten.` : "Ingen kostnad er registrert. Dette kan være korrekt, men må bekreftes manuelt.",
    href: "/attribution",
  });
  checks.push({
    id: "source-quality",
    label: "Lead-kilder har tilstrekkelig dekning",
    status: marketing.summary.knownSourceSharePercent >= 80 ? "PASS" : "WARNING",
    detail: `${Math.round(marketing.summary.knownSourceSharePercent)} % av månedens leads har kjent kilde.`,
    href: "/attribution",
  });
  checks.push({
    id: "keyholding-plans",
    label: "Aktive Keyholding-avtaler har plan",
    status: missingPlanAtMonthEnd > 0 ? "BLOCKED" : "PASS",
    detail: missingPlanAtMonthEnd > 0 ? `${missingPlanAtMonthEnd} aktive avtaler ved månedsslutt mangler registrert plan.` : "Aktive avtaler ved månedsslutt har registrert plan.",
    href: "/service-revenue",
  });
  const goalsConfigured = goals.some((item) => item.target !== null);
  checks.push({
    id: "goals",
    label: "Månedens mål er registrert",
    status: goalsConfigured ? "PASS" : "WARNING",
    detail: goalsConfigured ? "Rapporten sammenligner faktiske resultater med brukerdefinerte mål." : "Ingen mål er satt for valgt måned og scope.",
    href: "/goals",
  });

  const blockerCount = checks.filter((item) => item.status === "BLOCKED").length;
  const warningCount = checks.filter((item) => item.status === "WARNING").length;
  const closeStatus: MonthlyCloseStatus = now < end ? "IN_PROGRESS" : blockerCount > 0 ? "REVIEW_REQUIRED" : "READY_TO_CLOSE";

  const brandIds = [...new Set(activityCases.map((item) => item.brandId))];
  const brands = brandIds.map((id) => {
    const rows = commissions.cases.filter((item) => item.brandId === id);
    const wonRows = rows.filter((item) => inPeriod(item.wonAt, start, end));
    return {
      brandId: id,
      wonDeals: wonRows.length,
      dealValue: wonRows.reduce((sum, item) => sum + item.dealValue, 0),
      earnedCommission: sumCases(wonRows, () => true),
      invoicedCommission: sumCases(rows, (item) => inPeriod(item.invoiceSentAt, start, end)),
      collectedCommission: sumCases(rows, (item) => inPeriod(item.paidAt, start, end)),
      estimatedCommissionExcluded: wonRows.filter((item) => item.commissionEstimated).reduce((sum, item) => sum + item.commissionAmount, 0),
    };
  }).sort((a, b) => b.earnedCommission - a.earnedCommission || b.collectedCommission - a.collectedCommission);

  const deals: MonthlyCloseDealRow[] = activityCases.map((item) => ({
    id: item.id,
    name: item.name,
    brandId: item.brandId,
    wonAt: item.wonAt,
    invoiceSentAt: item.invoiceSentAt,
    paidAt: item.paidAt,
    invoiceNumber: item.invoiceNumber,
    dealValue: item.dealValue,
    commissionAmount: item.commissionAmount,
    commissionConfirmed: item.commissionConfirmed,
    earnedInPeriod: inPeriod(item.wonAt, start, end),
    invoicedInPeriod: inPeriod(item.invoiceSentAt, start, end),
    collectedInPeriod: inPeriod(item.paidAt, start, end),
    currentStatus: item.status,
    href: item.href,
  })).sort((a, b) => b.commissionAmount - a.commissionAmount || a.name.localeCompare(b.name, "nb"));

  const marketingContribution = earnedCommission - marketing.summary.totalSpendEur;
  const cashAfterMarketing = collectedCommission - marketing.summary.totalSpendEur;
  const warnings = [...new Set([...(input.warnings || []), ...marketing.warnings])];

  return {
    generatedAt: now.toISOString(),
    scope: input.scope,
    period: {
      start: start.toISOString(),
      end: end.toISOString(),
      month,
      elapsedPercent: Math.round(elapsed * 100),
      isComplete: now >= end,
    },
    closeStatus,
    headline: closeHeadline(closeStatus, blockerCount, warningCount),
    summary: {
      wonDeals: earnedCases.length,
      dealValue,
      earnedCommission,
      estimatedCommissionExcluded,
      invoicedCommission,
      collectedCommission,
      currentOutstandingCommission,
      currentOverdueCommission,
      currentCollectionRate: commissions.summary.collectionRate,
      marketingSpend: marketing.summary.totalSpendEur,
      marketingContribution,
      cashAfterMarketing,
      cohortEarnedRoas: marketing.summary.earnedRoas,
      cohortCashRoas: marketing.summary.cashRoas,
      monthEndKeyholdingMrr,
      monthEndKeyholdingArr: monthEndKeyholdingMrr * 12,
      newKeyholdingContracts,
      renewedKeyholdingContracts,
      pausedKeyholdingContracts,
      cancelledKeyholdingContracts,
      recoveredLeads,
    },
    commission: {
      earnedWithoutInvoiceCount,
      paidWithoutInvoiceNumberCount,
      missingTermsCount,
      currentOutstandingNote: "Utestående og forfalt provisjon er dagens saldo for valgt scope, ikke en historisk månedssluttsnapshot.",
    },
    marketing,
    keyholding: {
      activeAtMonthEnd,
      missingPlanAtMonthEnd,
      currentMrr: services.summary.monthlyRecurringRevenue,
      currentArr: services.summary.annualRecurringRevenue,
      potentialCurrentMrr: services.summary.potentialMonthlyRevenue,
    },
    goals,
    checks,
    brands,
    deals,
    warnings,
    assumptions: [
      "Opptjent provisjon periodiseres etter registrert won/closed/sale-dato og inkluderer bare bekreftet beløp eller sats.",
      "Fakturert provisjon periodiseres etter registrert commission_invoice_sent-hendelse.",
      "Innbetalt provisjon periodiseres etter commission_paid_date eller registrert payment received-hendelse.",
      "Markedsførings-ROAS følger lead-kohorten: senere salg attribueres tilbake til den første dokumenterte kilden i valgt måned.",
      "Keyholding MRR ved månedsslutt rekonstrueres fra registrerte start-, fornyelses-, pause- og avslutningshendelser.",
      "Marketing contribution og cash after marketing trekker bare registrert markedsføringskostnad fra provisjon; de er ikke regnskapsmessig resultat eller full kontantstrøm.",
    ],
    safety: {
      readOnly: true,
      accountingPosting: false,
      invoiceCreation: false,
      automaticSending: false,
    },
  };
}
