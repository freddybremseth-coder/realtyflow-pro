export type CommissionCaseStatus =
  | "MISSING_TERMS"
  | "READY_TO_INVOICE"
  | "INVOICE_PREPARED"
  | "INVOICED"
  | "OVERDUE"
  | "PAID";

export type CommissionPriority = "HIGH" | "MEDIUM" | "LOW";

export type CommissionActionId =
  | "commission_invoice_prepared"
  | "commission_invoice_sent"
  | "commission_payment_followup"
  | "commission_payment_received";

export interface CommissionContactInput {
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
  property_interest?: string | null;
  interactions?: unknown[] | null;
  next_followup?: string | null;
  won_at?: string | null;
  closed_at?: string | null;
  sale_date?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface CommissionEvent {
  action: CommissionActionId;
  at: Date;
  dueAt: Date | null;
  invoiceNumber: string | null;
}

export interface CommissionCase {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: string;
  propertyInterest: string | null;
  dealValue: number;
  commissionAmount: number;
  commissionPercent: number | null;
  commissionConfirmed: boolean;
  commissionEstimated: boolean;
  wonAt: string;
  ageDays: number;
  status: CommissionCaseStatus;
  priority: CommissionPriority;
  score: number;
  invoicePreparedAt: string | null;
  invoiceSentAt: string | null;
  invoiceDueAt: string | null;
  invoiceNumber: string | null;
  paidAt: string | null;
  daysOutstanding: number;
  nextFollowupAt: string | null;
  followupOverdue: boolean;
  issues: string[];
  recommendedAction: string;
  href: string;
}

export interface CommissionBrandSummary {
  brandId: string;
  wonDeals: number;
  confirmedCommission: number;
  estimatedCommission: number;
  outstandingCommission: number;
  overdueCommission: number;
  paidCommission: number;
  readyCount: number;
  missingTermsCount: number;
}

export interface CommissionCollection {
  generatedAt: string;
  assumptions: {
    fallbackCommissionPercent: number;
    defaultInvoiceDueDays: number;
    note: string;
  };
  summary: {
    wonDeals: number;
    confirmedCommission: number;
    estimatedUnconfirmedCommission: number;
    readyToInvoiceCommission: number;
    preparedCommission: number;
    invoicedOutstandingCommission: number;
    overdueOutstandingCommission: number;
    paidCommission: number;
    missingTermsCount: number;
    overdueCount: number;
    followupDueCount: number;
    collectionRate: number | null;
  };
  brands: CommissionBrandSummary[];
  cases: CommissionCase[];
}

export const COMMISSION_FALLBACK_PERCENT = 3;
export const DEFAULT_INVOICE_DUE_DAYS = 14;

const WON_STATUSES = new Set([
  "WON",
  "VUNNET",
  "SOLGT",
  "SOLD",
  "CLOSED_WON",
  "CLOSED",
  "COMPLETED",
  "CUSTOMER",
  "KUNDE",
  "VIP",
]);

const ACTIONS = new Set<CommissionActionId>([
  "commission_invoice_prepared",
  "commission_invoice_sent",
  "commission_payment_followup",
  "commission_payment_received",
]);

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

export function isWonCommissionContact(contact: CommissionContactInput) {
  return WON_STATUSES.has(normalizeToken(contact.pipeline_status || contact.status || contact.stage));
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(earlier: Date, later: Date) {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / 86_400_000));
}

function brandIdFor(contact: CommissionContactInput) {
  return String(contact.brand_id || contact.brand || "zeneco").trim().toLowerCase() || "zeneco";
}

function actionFromInteraction(item: unknown): CommissionEvent | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const metadata = row.metadata && typeof row.metadata === "object"
    ? row.metadata as Record<string, unknown>
    : {};
  const candidate = String(row.action || metadata.action || "").trim() as CommissionActionId;
  let action = ACTIONS.has(candidate) ? candidate : null;

  if (!action) {
    const text = String(row.content || row.body || row.message || "").toLowerCase();
    if (/faktura.*klargjort|invoice.*prepared/.test(text)) action = "commission_invoice_prepared";
    else if (/faktura.*sendt|invoice.*sent/.test(text)) action = "commission_invoice_sent";
    else if (/betalingsoppfølging|payment follow.?up|purring/.test(text)) action = "commission_payment_followup";
    else if (/provisjon.*betalt|payment.*received|betaling.*mottatt/.test(text)) action = "commission_payment_received";
  }

  if (!action) return null;
  const at = safeDate(row.date || row.created_at || row.timestamp || metadata.at);
  if (!at) return null;
  return {
    action,
    at,
    dueAt: safeDate(metadata.due_date || metadata.dueAt),
    invoiceNumber: String(metadata.invoice_number || metadata.invoiceNumber || "").trim() || null,
  };
}

function eventsFor(interactions?: unknown[] | null) {
  return (interactions || [])
    .map(actionFromInteraction)
    .filter(Boolean)
    .sort((a, b) => b!.at.getTime() - a!.at.getTime()) as CommissionEvent[];
}

function latestEvent(events: CommissionEvent[], action: CommissionActionId) {
  return events.find((event) => event.action === action) || null;
}

function confirmedCommission(contact: CommissionContactInput) {
  const explicitAmount = Math.max(0, numberValue(contact.commission_amount));
  const dealValue = Math.max(0, numberValue(contact.sale_price) || numberValue(contact.pipeline_value));
  const suppliedPercent = numberValue(contact.commission_percent);
  const validPercent = suppliedPercent > 0 && suppliedPercent <= 100;

  if (explicitAmount > 0) {
    return {
      amount: explicitAmount,
      percent: validPercent ? suppliedPercent : null,
      confirmed: true,
      estimated: false,
    };
  }
  if (dealValue > 0 && validPercent) {
    return {
      amount: dealValue * (suppliedPercent / 100),
      percent: suppliedPercent,
      confirmed: true,
      estimated: false,
    };
  }
  return {
    amount: dealValue * (COMMISSION_FALLBACK_PERCENT / 100),
    percent: null,
    confirmed: false,
    estimated: dealValue > 0,
  };
}

export function buildCommissionCase(contact: CommissionContactInput, now = new Date()): CommissionCase | null {
  if (!isWonCommissionContact(contact)) return null;

  const wonAt = safeDate(contact.won_at || contact.closed_at || contact.sale_date || contact.updated_at || contact.created_at);
  if (!wonAt) return null;

  const dealValue = Math.max(0, numberValue(contact.sale_price) || numberValue(contact.pipeline_value));
  const commission = confirmedCommission(contact);
  const events = eventsFor(contact.interactions);
  const prepared = latestEvent(events, "commission_invoice_prepared");
  const sent = latestEvent(events, "commission_invoice_sent");
  const paymentEvent = latestEvent(events, "commission_payment_received");
  const paidAt = safeDate(contact.commission_paid_date) || paymentEvent?.at || null;
  const invoiceDueAt = sent?.dueAt || (sent ? new Date(sent.at.getTime() + DEFAULT_INVOICE_DUE_DAYS * 86_400_000) : null);
  const nextFollowup = safeDate(contact.next_followup);
  const followupOverdue = Boolean(nextFollowup && nextFollowup.getTime() < now.getTime() && !paidAt);
  const overdue = Boolean(sent && !paidAt && invoiceDueAt && invoiceDueAt.getTime() < now.getTime());

  let status: CommissionCaseStatus;
  if (paidAt) status = "PAID";
  else if (!commission.confirmed) status = "MISSING_TERMS";
  else if (overdue) status = "OVERDUE";
  else if (sent) status = "INVOICED";
  else if (prepared) status = "INVOICE_PREPARED";
  else status = "READY_TO_INVOICE";

  const ageDays = daysBetween(wonAt, now);
  const daysOutstanding = sent && !paidAt ? daysBetween(sent.at, now) : 0;
  const issues: string[] = [];
  if (!commission.confirmed) issues.push("Avtalt provisjonsbeløp eller sats mangler");
  if (dealValue <= 0) issues.push("Salgsverdi mangler");
  if (overdue) issues.push(`Fakturaen er forfalt med ${daysBetween(invoiceDueAt!, now)} dager`);
  else if (sent && !paidAt) issues.push(`Fakturaen har vært utestående i ${daysOutstanding} dager`);
  if (followupOverdue) issues.push("Intern betalingsoppfølging er forsinket");
  if (!String(contact.email || "").trim() && !String(contact.phone || "").trim()) issues.push("Kontaktkanal mangler");

  let score = 10;
  if (overdue) score += 50;
  else if (sent && !paidAt) score += 30;
  else if (prepared) score += 20;
  else if (commission.confirmed) score += ageDays >= 7 ? 25 : 12;
  else score += 22;
  if (followupOverdue) score += 15;
  if (commission.amount >= 25_000) score += 12;
  else if (commission.amount >= 10_000) score += 7;
  if (ageDays >= 30 && !paidAt) score += 10;
  score = Math.max(0, Math.min(100, score));

  const priority: CommissionPriority = score >= 70 ? "HIGH" : score >= 42 ? "MEDIUM" : "LOW";
  let recommendedAction = "Bevar dokumentasjonen og følg opp ved avtalt tidspunkt.";
  if (status === "MISSING_TERMS") recommendedAction = "Registrer faktisk provisjonsbeløp eller avtalt sats før fakturering.";
  else if (status === "READY_TO_INVOICE") recommendedAction = "Klargjør fakturagrunnlaget og kontroller mottakerinformasjon.";
  else if (status === "INVOICE_PREPARED") recommendedAction = "Registrer at fakturaen er sendt og sett betalingsfrist.";
  else if (status === "INVOICED") recommendedAction = "Følg betalingsfristen og sett en konkret intern oppfølgingsdato.";
  else if (status === "OVERDUE") recommendedAction = "Følg opp den forfalte provisjonen og dokumenter kontakten manuelt.";
  else if (status === "PAID") recommendedAction = "Kontroller at betaling, bilag og eventuell provisjonsdeling er dokumentert.";

  return {
    id: contact.id,
    name: String(contact.name || contact.email || "Ukjent kunde"),
    email: contact.email || null,
    phone: contact.phone || null,
    brandId: brandIdFor(contact),
    propertyInterest: contact.property_interest || null,
    dealValue,
    commissionAmount: commission.amount,
    commissionPercent: commission.percent,
    commissionConfirmed: commission.confirmed,
    commissionEstimated: commission.estimated,
    wonAt: wonAt.toISOString(),
    ageDays,
    status,
    priority,
    score,
    invoicePreparedAt: prepared?.at.toISOString() || null,
    invoiceSentAt: sent?.at.toISOString() || null,
    invoiceDueAt: invoiceDueAt?.toISOString() || null,
    invoiceNumber: sent?.invoiceNumber || prepared?.invoiceNumber || null,
    paidAt: paidAt?.toISOString() || null,
    daysOutstanding,
    nextFollowupAt: nextFollowup?.toISOString() || null,
    followupOverdue,
    issues,
    recommendedAction,
    href: `/customers/${encodeURIComponent(contact.id)}`,
  };
}

export function sortCommissionCases(cases: CommissionCase[]) {
  const priorityWeight: Record<CommissionPriority, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  const statusWeight: Record<CommissionCaseStatus, number> = {
    OVERDUE: 6,
    INVOICED: 5,
    READY_TO_INVOICE: 4,
    INVOICE_PREPARED: 3,
    MISSING_TERMS: 2,
    PAID: 1,
  };
  return [...cases].sort((a, b) => {
    const priorityDelta = priorityWeight[b.priority] - priorityWeight[a.priority];
    if (priorityDelta) return priorityDelta;
    const statusDelta = statusWeight[b.status] - statusWeight[a.status];
    if (statusDelta) return statusDelta;
    if (b.commissionAmount !== a.commissionAmount) return b.commissionAmount - a.commissionAmount;
    return b.ageDays - a.ageDays;
  });
}

export function buildCommissionCollection(contacts: CommissionContactInput[], now = new Date()): CommissionCollection {
  const cases = sortCommissionCases(
    contacts.map((contact) => buildCommissionCase(contact, now)).filter(Boolean) as CommissionCase[],
  );

  const brandIds = [...new Set(cases.map((item) => item.brandId))];
  const brands = brandIds.map((brandId) => {
    const rows = cases.filter((item) => item.brandId === brandId);
    return {
      brandId,
      wonDeals: rows.length,
      confirmedCommission: rows.filter((item) => item.commissionConfirmed).reduce((sum, item) => sum + item.commissionAmount, 0),
      estimatedCommission: rows.filter((item) => item.commissionEstimated).reduce((sum, item) => sum + item.commissionAmount, 0),
      outstandingCommission: rows.filter((item) => ["INVOICED", "OVERDUE"].includes(item.status)).reduce((sum, item) => sum + item.commissionAmount, 0),
      overdueCommission: rows.filter((item) => item.status === "OVERDUE").reduce((sum, item) => sum + item.commissionAmount, 0),
      paidCommission: rows.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.commissionAmount, 0),
      readyCount: rows.filter((item) => ["READY_TO_INVOICE", "INVOICE_PREPARED"].includes(item.status)).length,
      missingTermsCount: rows.filter((item) => item.status === "MISSING_TERMS").length,
    };
  }).sort((a, b) => b.outstandingCommission - a.outstandingCommission || b.confirmedCommission - a.confirmedCommission);

  const confirmedRows = cases.filter((item) => item.commissionConfirmed);
  const paidCommission = confirmedRows.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.commissionAmount, 0);
  const outstandingConfirmed = confirmedRows.filter((item) => item.status !== "PAID").reduce((sum, item) => sum + item.commissionAmount, 0);
  const collectibleTotal = paidCommission + outstandingConfirmed;

  return {
    generatedAt: now.toISOString(),
    assumptions: {
      fallbackCommissionPercent: COMMISSION_FALLBACK_PERCENT,
      defaultInvoiceDueDays: DEFAULT_INVOICE_DUE_DAYS,
      note: "3 %-beløp er kun et internt estimat når avtalt provisjon mangler. Estimatet regnes ikke som bekreftet eller fakturerbart.",
    },
    summary: {
      wonDeals: cases.length,
      confirmedCommission: confirmedRows.reduce((sum, item) => sum + item.commissionAmount, 0),
      estimatedUnconfirmedCommission: cases.filter((item) => item.commissionEstimated).reduce((sum, item) => sum + item.commissionAmount, 0),
      readyToInvoiceCommission: cases.filter((item) => item.status === "READY_TO_INVOICE").reduce((sum, item) => sum + item.commissionAmount, 0),
      preparedCommission: cases.filter((item) => item.status === "INVOICE_PREPARED").reduce((sum, item) => sum + item.commissionAmount, 0),
      invoicedOutstandingCommission: cases.filter((item) => ["INVOICED", "OVERDUE"].includes(item.status)).reduce((sum, item) => sum + item.commissionAmount, 0),
      overdueOutstandingCommission: cases.filter((item) => item.status === "OVERDUE").reduce((sum, item) => sum + item.commissionAmount, 0),
      paidCommission,
      missingTermsCount: cases.filter((item) => item.status === "MISSING_TERMS").length,
      overdueCount: cases.filter((item) => item.status === "OVERDUE").length,
      followupDueCount: cases.filter((item) => item.followupOverdue).length,
      collectionRate: collectibleTotal > 0 ? paidCommission / collectibleTotal : null,
    },
    brands,
    cases,
  };
}
