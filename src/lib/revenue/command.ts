import { approvalSummary, buildApprovalQueue, type ApprovalItem } from "@/lib/approvals";
import { buildAfterSalesCustomer, sortAfterSalesCustomers } from "@/lib/revenue/after-sales";
import { buildClosingOpportunity, sortClosingOpportunities } from "@/lib/revenue/closing";
import { buildCommissionCollection } from "@/lib/revenue/commissions";
import { buildRevenueForecast } from "@/lib/revenue/forecast";
import { buildRecoveryWorkspace } from "@/lib/revenue/recovery";
import { buildServiceRevenueWorkspace } from "@/lib/revenue/service-revenue";
import { buildRevenuePriority, sortRevenuePriorities } from "@/lib/revenue/today";

export type CommandPriority = "CRITICAL" | "HIGH" | "MEDIUM";
export type CommandState = "CRITICAL" | "ATTENTION" | "HEALTHY" | "INFO";
export type CommandSource =
  | "today"
  | "closing"
  | "approvals"
  | "commissions"
  | "recovery"
  | "service-revenue"
  | "after-sales";

export interface RevenueCommandInput {
  contacts: any[];
  profiles?: any[];
  shortlists?: any[];
  presentations?: any[];
  messageDrafts?: any[];
  warnings?: string[];
}

export interface CommandAction {
  id: string;
  source: CommandSource;
  priority: CommandPriority;
  score: number;
  title: string;
  subject: string;
  description: string;
  value: number;
  href: string;
  contactId: string | null;
}

export interface CommandWorkstream {
  id: CommandSource | "forecast";
  label: string;
  href: string;
  state: CommandState;
  primaryMetric: string;
  secondaryMetric: string;
  count: number;
}

export interface RevenueCommandCenter {
  generatedAt: string;
  headline: string;
  summary: {
    criticalActions: number;
    highActions: number;
    activeDeals: number;
    forecast30Commission: number;
    forecast90Commission: number;
    overdueCommission: number;
    readyToInvoiceCommission: number;
    monthlyRecurringRevenue: number;
    annualRecurringRevenue: number;
    potentialAnnualRecurringRevenue: number;
    recoverNow: number;
    recoveryValue: number;
    approvalReady: number;
    closingHighRisk: number;
    afterSalesDue: number;
    dataQualityScore: number;
  };
  workstreams: CommandWorkstream[];
  topActions: CommandAction[];
  warnings: string[];
  safety: {
    readOnly: true;
    automaticSending: false;
    automaticApproval: false;
    automaticPipelineChanges: false;
  };
}

function money(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function priorityFromScore(score: number): CommandPriority {
  if (score >= 100) return "CRITICAL";
  if (score >= 75) return "HIGH";
  return "MEDIUM";
}

function stateFor(critical: boolean, attention: boolean, info = false): CommandState {
  if (critical) return "CRITICAL";
  if (attention) return "ATTENTION";
  return info ? "INFO" : "HEALTHY";
}

function dedupeActions(actions: CommandAction[]) {
  const selected = new Map<string, CommandAction>();
  for (const action of [...actions].sort((a, b) => b.score - a.score || b.value - a.value)) {
    const key = action.contactId ? `contact:${action.contactId}` : `${action.source}:${action.id}`;
    if (!selected.has(key)) selected.set(key, action);
  }
  return [...selected.values()].sort((a, b) => b.score - a.score || b.value - a.value).slice(0, 12);
}

function approvalActions(items: ApprovalItem[]): CommandAction[] {
  return items.slice(0, 12).map((item) => {
    const score = item.ready ? 84 + Math.min(12, item.ageDays) : 55 + Math.min(10, item.ageDays);
    return {
      id: `approval-${item.type}-${item.id}`,
      source: "approvals" as const,
      priority: priorityFromScore(score),
      score,
      title: item.ready ? "Godkjenning er klar" : "Godkjenning er blokkert",
      subject: `${item.customerName} · ${item.title}`,
      description: item.ready ? "Åpne den kontrollerte gjennomgangen og ta en manuell beslutning." : item.blocker || "Et tidligere godkjenningstrinn mangler.",
      value: 0,
      href: item.reviewHref,
      contactId: item.contactId,
    };
  });
}

export function buildRevenueCommandCenter(input: RevenueCommandInput, now = new Date()): RevenueCommandCenter {
  const contacts = input.contacts || [];
  const today = sortRevenuePriorities(
    contacts.map((contact) => buildRevenuePriority(contact, now)).filter(Boolean) as NonNullable<ReturnType<typeof buildRevenuePriority>>[],
  );
  const closing = sortClosingOpportunities(
    contacts.map((contact) => buildClosingOpportunity(contact, now)).filter(Boolean) as NonNullable<ReturnType<typeof buildClosingOpportunity>>[],
  );
  const forecast = buildRevenueForecast(contacts, now);
  const commissions = buildCommissionCollection(contacts, now);
  const recovery = buildRecoveryWorkspace(contacts, now);
  const services = buildServiceRevenueWorkspace(contacts, now);
  const afterSales = sortAfterSalesCustomers(
    contacts.map((contact) => buildAfterSalesCustomer(contact, now)).filter(Boolean) as NonNullable<ReturnType<typeof buildAfterSalesCustomer>>[],
  );
  const approvals = buildApprovalQueue({
    contacts,
    profiles: input.profiles || [],
    shortlists: input.shortlists || [],
    presentations: input.presentations || [],
    messageDrafts: input.messageDrafts || [],
  }, now);
  const approvalStats = approvalSummary(approvals);

  const actions: CommandAction[] = [];

  for (const item of today.filter((row) => row.priority === "CRITICAL" || row.priority === "HIGH").slice(0, 12)) {
    const score = item.priority === "CRITICAL" ? 105 + item.score / 10 : 78 + item.score / 10;
    actions.push({
      id: `today-${item.id}`,
      source: "today",
      priority: priorityFromScore(score),
      score,
      title: item.priority === "CRITICAL" ? "Kritisk salgsoppfølging" : "Prioritert salgsoppfølging",
      subject: item.contactName,
      description: item.recommendedAction,
      value: item.value,
      href: item.href,
      contactId: item.id,
    });
  }

  for (const item of closing.filter((row) => row.risk === "HIGH").slice(0, 10)) {
    const score = 92 + (item.stage === "NEGOTIATION" ? 10 : 0) + item.score / 20;
    actions.push({
      id: `closing-${item.id}`,
      source: "closing",
      priority: priorityFromScore(score),
      score,
      title: "Closing med høy risiko",
      subject: item.name,
      description: item.nextAction,
      value: item.value,
      href: "/closing",
      contactId: item.id,
    });
  }

  for (const item of commissions.cases.filter((row) => row.status !== "PAID").slice(0, 12)) {
    let score = 68;
    if (item.status === "OVERDUE") score = 115;
    else if (item.status === "READY_TO_INVOICE") score = 88;
    else if (item.status === "INVOICE_PREPARED") score = 82;
    else if (item.status === "INVOICED") score = 80;
    else if (item.status === "MISSING_TERMS") score = 74;
    score += Math.min(10, item.commissionAmount / 5000);
    actions.push({
      id: `commission-${item.id}`,
      source: "commissions",
      priority: priorityFromScore(score),
      score,
      title: item.status === "OVERDUE" ? "Forfalt provisjon" : "Provisjon krever handling",
      subject: item.name,
      description: item.recommendedAction,
      value: item.commissionConfirmed ? item.commissionAmount : 0,
      href: "/commissions",
      contactId: item.id,
    });
  }

  for (const item of services.accounts.filter((row) => row.lifecycle !== "CANCELLED").slice(0, 12)) {
    let score = 58;
    if (item.lifecycle === "RENEWAL_DUE") score = 108;
    else if (item.overdue) score = 92;
    else if (item.lifecycle === "OFFERED") score = 78;
    else if (item.lifecycle === "PAUSED") score = 76;
    else if (item.lifecycle === "OFFER_PLANNED") score = 70;
    actions.push({
      id: `service-${item.id}`,
      source: "service-revenue",
      priority: priorityFromScore(score),
      score,
      title: item.lifecycle === "RENEWAL_DUE" ? "Keyholding-fornyelse" : "Keyholding-inntektsmulighet",
      subject: item.name,
      description: item.recommendedAction,
      value: item.lifecycle === "ACTIVE" || item.lifecycle === "RENEWAL_DUE" ? item.annualRevenue : item.potentialAnnualRevenue,
      href: "/service-revenue",
      contactId: item.id,
    });
  }

  for (const item of recovery.leads.filter((row) => row.disposition === "RECOVER_NOW").slice(0, 10)) {
    const score = 84 + (item.dueNow ? 12 : 0) + item.recoveryScore / 20;
    actions.push({
      id: `recovery-${item.id}`,
      source: "recovery",
      priority: priorityFromScore(score),
      score,
      title: "Lead kan gjenopptas",
      subject: item.name,
      description: item.recommendedAction,
      value: item.dealValue,
      href: "/recovery",
      contactId: item.id,
    });
  }

  for (const customer of afterSales.filter((row) => row.isOverdue || row.dueActions.length > 0).slice(0, 10)) {
    const score = customer.isOverdue ? 78 : 64 + Math.min(12, customer.dueActions.length * 3);
    actions.push({
      id: `after-sales-${customer.id}`,
      source: "after-sales",
      priority: priorityFromScore(score),
      score,
      title: "Ettermarked krever oppfølging",
      subject: customer.name,
      description: customer.recommendedAction,
      value: customer.value,
      href: "/after-sales",
      contactId: customer.id,
    });
  }

  actions.push(...approvalActions(approvals));
  const topActions = dedupeActions(actions);
  const criticalActions = topActions.filter((item) => item.priority === "CRITICAL").length;
  const highActions = topActions.filter((item) => item.priority === "HIGH").length;
  const closingHighRisk = closing.filter((item) => item.risk === "HIGH").length;
  const afterSalesDue = afterSales.filter((item) => item.isOverdue || item.dueActions.length > 0).length;

  let headline = "Pipeline og relasjoner er under kontroll. Bygg neste konkrete salgssteg.";
  if (commissions.summary.overdueOutstandingCommission > 0) headline = `Prioriter innkreving av ${money(commissions.summary.overdueOutstandingCommission)} i forfalt provisjon.`;
  else if (closingHighRisk > 0) headline = `${closingHighRisk} closing-saker har høy risiko og bør avklares først.`;
  else if (services.summary.renewalDue > 0) headline = `${services.summary.renewalDue} Keyholding-avtaler krever fornyelse.`;
  else if (approvalStats.ready > 0) headline = `${approvalStats.ready} elementer er klare for manuell godkjenning.`;
  else if (recovery.summary.recoverNow > 0) headline = `${recovery.summary.recoverNow} tapte eller pausede leads har gjenopptakspotensial.`;

  const workstreams: CommandWorkstream[] = [
    {
      id: "today",
      label: "Dagens salg",
      href: "/today",
      state: stateFor(today.some((item) => item.priority === "CRITICAL"), today.some((item) => item.priority === "HIGH")),
      primaryMetric: `${today.filter((item) => item.priority === "CRITICAL" || item.priority === "HIGH").length} prioriterte`,
      secondaryMetric: `${today.filter((item) => item.isOverdue).length} forfalte oppfølginger`,
      count: today.length,
    },
    {
      id: "closing",
      label: "Closing",
      href: "/closing",
      state: stateFor(closingHighRisk > 0, closing.some((item) => item.risk === "MEDIUM")),
      primaryMetric: `${closingHighRisk} høy risiko`,
      secondaryMetric: `${money(closing.reduce((sum, item) => sum + item.value, 0))} aktiv verdi`,
      count: closing.length,
    },
    {
      id: "forecast",
      label: "Forecast",
      href: "/forecast",
      state: stateFor(forecast.summary.atRiskDeals > 2, forecast.summary.atRiskDeals > 0 || forecast.summary.dataQualityScore < 80),
      primaryMetric: `${money(forecast.summary.forecast30Commission)} neste 30 dager`,
      secondaryMetric: `${forecast.summary.dataQualityScore} % datakvalitet`,
      count: forecast.summary.activeDeals,
    },
    {
      id: "approvals",
      label: "Godkjenninger",
      href: "/approvals",
      state: stateFor(approvalStats.ready >= 5, approvalStats.ready > 0 || approvalStats.blocked > 0, approvalStats.pending === 0),
      primaryMetric: `${approvalStats.ready} klare`,
      secondaryMetric: `${approvalStats.blocked} blokkert`,
      count: approvalStats.pending,
    },
    {
      id: "commissions",
      label: "Commission & Cash",
      href: "/commissions",
      state: stateFor(commissions.summary.overdueOutstandingCommission > 0, commissions.summary.readyToInvoiceCommission > 0 || commissions.summary.missingTermsCount > 0),
      primaryMetric: `${money(commissions.summary.overdueOutstandingCommission)} forfalt`,
      secondaryMetric: `${money(commissions.summary.readyToInvoiceCommission)} klar til fakturering`,
      count: commissions.summary.wonDeals,
    },
    {
      id: "recovery",
      label: "Lost Lead Recovery",
      href: "/recovery",
      state: stateFor(recovery.summary.dueNow >= 3, recovery.summary.recoverNow > 0 || recovery.summary.missingReason > 0),
      primaryMetric: `${recovery.summary.recoverNow} kan tas opp`,
      secondaryMetric: `${money(recovery.summary.highPotentialValue)} potensial`,
      count: recovery.summary.dormantLeads,
    },
    {
      id: "service-revenue",
      label: "Keyholding Revenue",
      href: "/service-revenue",
      state: stateFor(services.summary.renewalDue > 0, services.summary.overdueFollowups > 0 || services.summary.offersOutstanding > 0),
      primaryMetric: `${money(services.summary.monthlyRecurringRevenue)} MRR`,
      secondaryMetric: `${money(services.summary.potentialAnnualRevenue)} potensiell ARR`,
      count: services.summary.eligibleCustomers,
    },
    {
      id: "after-sales",
      label: "After-sales",
      href: "/after-sales",
      state: stateFor(afterSales.filter((item) => item.isOverdue).length >= 3, afterSalesDue > 0),
      primaryMetric: `${afterSalesDue} krever oppfølging`,
      secondaryMetric: `${afterSales.length} vunne kunder`,
      count: afterSales.length,
    },
  ];

  return {
    generatedAt: now.toISOString(),
    headline,
    summary: {
      criticalActions,
      highActions,
      activeDeals: forecast.summary.activeDeals,
      forecast30Commission: forecast.summary.forecast30Commission,
      forecast90Commission: forecast.summary.forecast90Commission,
      overdueCommission: commissions.summary.overdueOutstandingCommission,
      readyToInvoiceCommission: commissions.summary.readyToInvoiceCommission,
      monthlyRecurringRevenue: services.summary.monthlyRecurringRevenue,
      annualRecurringRevenue: services.summary.annualRecurringRevenue,
      potentialAnnualRecurringRevenue: services.summary.potentialAnnualRevenue,
      recoverNow: recovery.summary.recoverNow,
      recoveryValue: recovery.summary.highPotentialValue,
      approvalReady: approvalStats.ready,
      closingHighRisk,
      afterSalesDue,
      dataQualityScore: forecast.summary.dataQualityScore,
    },
    workstreams,
    topActions,
    warnings: input.warnings || [],
    safety: {
      readOnly: true,
      automaticSending: false,
      automaticApproval: false,
      automaticPipelineChanges: false,
    },
  };
}
