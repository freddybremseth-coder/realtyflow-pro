export const MONDEO_BRAND_ID = "mondeo";

export type MondeoPaymentRecord = {
  date: string;
  amount: number;
  note?: string;
  source?: string;
};

export type MondeoKpiAdjustment = {
  date: string;
  factor?: number;
  amount?: number;
  note?: string;
};

export type MondeoLedgerEvent = {
  id?: string | null;
  stream?: string | null;
  direction?: string | null;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  event_date?: string | null;
  description?: string | null;
  source_type?: string | null;
};

export type MondeoMonthRow = {
  month: string;
  label: string;
  openingBalance: number;
  interest: number;
  minimumDue: number;
  paid: number;
  capitalizedInterest: number;
  principalReduction: number;
  kpiAdjustment: number;
  closingBalance: number;
  arrears: number;
  transitionProtected: boolean;
};

export const MONDEO_CONTRACT = {
  brandId: MONDEO_BRAND_ID,
  brandName: "Mondeo Eiendom AS",
  orgNr: "914 462 509",
  propertyAddress: "Raveien 152E, 3242 Sandefjord",
  municipality: "Sandefjord kommune 3907",
  cadastral: "Gnr. 159 / Bnr. 64",
  seller: "Extrade Holding AS",
  buyer: "Nordic Group Invest AS / Odin Jacobsen",
  effectiveDate: "2026-06-01",
  firstPaymentDate: "2026-06-01",
  purchasePriceNok: 4_800_000,
  sellerCreditNok: 4_800_000,
  monthlyMinimumNok: 33_000,
  annualInterestRate: 0.09,
  monthlyInterestAtStartNok: 36_000,
  transitionNoCapitalizationUntil: "2026-10-31",
  kpiFirstAdjustmentDate: "2027-01-01",
  maxMaturityDate: "2036-06-01",
  securityLimitNok: 5_800_000,
  propertyMortgageNok: 7_500_000,
  personalGuaranteeLimitNok: 7_500_000,
  buyerInvestmentOutsidePurchasePriceNok: "600 000–700 000",
  sellerMonthlyLoanLoadNok: 8_800,
  municipalFeesMonthlyNok: 1_200,
  notes: [
    "Økonomisk virkning fra 1. juni 2026.",
    "Terminbeløpet på kr 33 000 er absolutt minimum.",
    "Rente er fast 9,00 % p.a. i kontraktsmodellen som ligger til grunn her.",
    "KPI skal kontrolleres årlig per 1. januar, første gang 1. januar 2027.",
    "Fødselsnummer/personnumre skal ikke legges i kildekoden.",
  ],
} as const;

const NOK_FORMATTER = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
  maximumFractionDigits: 0,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("nb-NO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const MONTH_FORMATTER = new Intl.DateTimeFormat("nb-NO", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatNok(value: number) {
  return NOK_FORMATTER.format(Math.round(value || 0));
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(2).replace(".", ",")} %`;
}

export function formatDate(isoDate: string | Date) {
  const date = isoDate instanceof Date ? isoDate : parseIsoDate(isoDate);
  return DATE_FORMATTER.format(date);
}

export function parseIsoDate(isoDate: string) {
  const [datePart] = isoDate.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day || 1));
}

export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(date: Date) {
  return MONTH_FORMATTER.format(date);
}

export function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

export function getNextDueDate(asOf = new Date()) {
  return new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));
}

export function getDueMonthsThrough(asOf = new Date()) {
  const months: Date[] = [];
  const start = parseIsoDate(MONDEO_CONTRACT.firstPaymentDate);
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function isTransitionProtectedMonth(month: Date) {
  const transitionEnd = parseIsoDate(MONDEO_CONTRACT.transitionNoCapitalizationUntil);
  return month <= new Date(Date.UTC(transitionEnd.getUTCFullYear(), transitionEnd.getUTCMonth(), 1));
}

function groupPaymentsByMonth(payments: MondeoPaymentRecord[]) {
  const grouped: Record<string, number> = {};
  for (const payment of payments) {
    if (!payment.date || !Number.isFinite(payment.amount)) continue;
    const date = parseIsoDate(payment.date);
    const key = monthKey(date);
    grouped[key] = (grouped[key] || 0) + Number(payment.amount || 0);
  }
  return grouped;
}

function groupKpiByMonth(kpiAdjustments: MondeoKpiAdjustment[]) {
  const grouped: Record<string, MondeoKpiAdjustment[]> = {};
  for (const adjustment of kpiAdjustments) {
    if (!adjustment.date) continue;
    const key = monthKey(parseIsoDate(adjustment.date));
    grouped[key] ||= [];
    grouped[key].push(adjustment);
  }
  return grouped;
}

export function buildMinimumPaymentsThrough(asOf = new Date()): MondeoPaymentRecord[] {
  return getDueMonthsThrough(asOf).map((month) => ({
    date: `${monthKey(month)}-01`,
    amount: MONDEO_CONTRACT.monthlyMinimumNok,
    note: "Kontraktsmessig minimumstermin",
    source: "contract-model",
  }));
}

export function calculateMondeoMinimumPaymentStatus(options?: {
  asOf?: Date;
  payments?: MondeoPaymentRecord[];
}) {
  const asOf = options?.asOf || new Date();
  const monthsDue = getDueMonthsThrough(asOf).length;
  const totalMinimumDue = monthsDue * MONDEO_CONTRACT.monthlyMinimumNok;
  const totalPaid = (options?.payments || []).reduce((sum, payment) => {
    if (payment.date) {
      const paymentDate = parseIsoDate(payment.date);
      if (Number.isFinite(paymentDate.getTime()) && paymentDate > asOf) return sum;
    }
    const amount = Number(payment.amount || 0);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);

  return {
    monthsDue,
    totalMinimumDue,
    totalPaid,
    gapToMinimum: Math.max(0, totalMinimumDue - totalPaid),
  };
}

function normalizeLedgerText(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function ledgerEventAmount(event: MondeoLedgerEvent) {
  const amount = Number(event.amount || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function isActiveLedgerEvent(event: MondeoLedgerEvent) {
  const status = normalizeLedgerText(event.status);
  return !["cancelled", "void", "deleted", "pending"].includes(status);
}

export function isMondeoLedgerPaymentEvent(event: MondeoLedgerEvent) {
  const stream = normalizeLedgerText(event.stream);
  const direction = normalizeLedgerText(event.direction);
  const currency = String(event.currency || "NOK").trim().toUpperCase();

  return (
    isActiveLedgerEvent(event) &&
    stream === "mondeo_payment" &&
    direction === "income" &&
    currency === "NOK" &&
    ledgerEventAmount(event) > 0
  );
}

export function isMondeoLedgerKpiEvent(event: MondeoLedgerEvent) {
  const stream = normalizeLedgerText(event.stream);
  return isActiveLedgerEvent(event) && stream === "kpi_adjustment" && ledgerEventAmount(event) > 0;
}

export function mondeoPaymentsFromLedgerEvents(events: MondeoLedgerEvent[]): MondeoPaymentRecord[] {
  return events
    .filter(isMondeoLedgerPaymentEvent)
    .map((event) => ({
      date: event.event_date || MONDEO_CONTRACT.firstPaymentDate,
      amount: ledgerEventAmount(event),
      note: event.description || event.stream || "Registrert betaling",
      source: event.source_type || "business_financial_events",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function mondeoKpiAdjustmentsFromLedgerEvents(events: MondeoLedgerEvent[]): MondeoKpiAdjustment[] {
  return events
    .filter(isMondeoLedgerKpiEvent)
    .map((event) => ({
      date: event.event_date || MONDEO_CONTRACT.kpiFirstAdjustmentDate,
      amount: ledgerEventAmount(event),
      note: event.description || event.stream || "KPI-justering",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeMondeoLedgerEvents(events: MondeoLedgerEvent[]) {
  const payments = mondeoPaymentsFromLedgerEvents(events);
  const kpiAdjustments = mondeoKpiAdjustmentsFromLedgerEvents(events);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalKpiAdjustment = kpiAdjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount || 0), 0);

  return {
    payments,
    kpiAdjustments,
    totalPaid,
    totalKpiAdjustment,
    totalReceivedAndKpi: totalPaid + totalKpiAdjustment,
  };
}

export function calculateMondeoSnapshot(options?: {
  asOf?: Date;
  payments?: MondeoPaymentRecord[];
  kpiAdjustments?: MondeoKpiAdjustment[];
}) {
  const asOf = options?.asOf || new Date();
  const payments = options?.payments || [];
  const kpiAdjustments = options?.kpiAdjustments || [];
  const paymentsByMonth = groupPaymentsByMonth(payments);
  const kpiByMonth = groupKpiByMonth(kpiAdjustments);
  const months = getDueMonthsThrough(asOf);
  const rows: MondeoMonthRow[] = [];

  let balance = MONDEO_CONTRACT.sellerCreditNok;
  let totalInterest = 0;
  let totalCapitalizedInterest = 0;
  let totalPrincipalReduction = 0;
  let totalKpiAdjustment = 0;
  let totalMinimumDue = 0;
  let totalPaid = 0;
  let totalArrears = 0;

  for (const month of months) {
    const key = monthKey(month);
    const openingBalance = balance;
    const transitionProtected = isTransitionProtectedMonth(month);
    const minimumDue = MONDEO_CONTRACT.monthlyMinimumNok;
    const paid = paymentsByMonth[key] || 0;
    const interest = Math.round(openingBalance * (MONDEO_CONTRACT.annualInterestRate / 12));

    let kpiAdjustment = 0;
    for (const adjustment of kpiByMonth[key] || []) {
      if (Number.isFinite(adjustment.amount)) {
        kpiAdjustment += Math.max(0, Number(adjustment.amount));
      } else if (adjustment.factor && adjustment.factor > 1) {
        kpiAdjustment += Math.round(balance * (adjustment.factor - 1));
      }
    }
    if (kpiAdjustment > 0) balance += kpiAdjustment;

    let capitalizedInterest = 0;
    let principalReduction = 0;
    let arrears = Math.max(0, minimumDue - paid);

    if (transitionProtected) {
      const extraPayment = Math.max(0, paid - minimumDue);
      principalReduction = Math.min(balance, extraPayment);
      balance -= principalReduction;
    } else if (paid >= interest) {
      principalReduction = Math.min(balance, paid - interest);
      balance -= principalReduction;
    } else {
      capitalizedInterest = interest - paid;
      balance += capitalizedInterest;
    }

    totalInterest += interest;
    totalCapitalizedInterest += capitalizedInterest;
    totalPrincipalReduction += principalReduction;
    totalKpiAdjustment += kpiAdjustment;
    totalMinimumDue += minimumDue;
    totalPaid += paid;
    totalArrears += arrears;

    rows.push({
      month: key,
      label: monthLabel(month),
      openingBalance,
      interest,
      minimumDue,
      paid,
      capitalizedInterest,
      principalReduction,
      kpiAdjustment,
      closingBalance: balance,
      arrears,
      transitionProtected,
    });
  }

  return {
    asOf: asOf.toISOString(),
    balance,
    rows,
    totalInterest,
    totalCapitalizedInterest,
    totalPrincipalReduction,
    totalKpiAdjustment,
    totalMinimumDue,
    totalPaid,
    totalArrears,
    monthsDue: months.length,
    nextDueDate: getNextDueDate(asOf).toISOString(),
    currentMonthlyInterest: Math.round(balance * (MONDEO_CONTRACT.annualInterestRate / 12)),
    needsSecurityFollowUp: balance >= MONDEO_CONTRACT.securityLimitNok,
  };
}

export function buildForwardPaymentPlan(openingBalance: number, startDate = getNextDueDate(), months = 12) {
  const rows: MondeoMonthRow[] = [];
  let balance = openingBalance;
  for (let index = 0; index < months; index += 1) {
    const month = addMonths(startDate, index);
    const opening = balance;
    const transitionProtected = isTransitionProtectedMonth(month);
    const interest = Math.round(opening * (MONDEO_CONTRACT.annualInterestRate / 12));
    const paid = MONDEO_CONTRACT.monthlyMinimumNok;
    let capitalizedInterest = 0;
    let principalReduction = 0;

    if (transitionProtected) {
      principalReduction = 0;
    } else if (paid >= interest) {
      principalReduction = Math.min(balance, paid - interest);
      balance -= principalReduction;
    } else {
      capitalizedInterest = interest - paid;
      balance += capitalizedInterest;
    }

    rows.push({
      month: monthKey(month),
      label: monthLabel(month),
      openingBalance: opening,
      interest,
      minimumDue: MONDEO_CONTRACT.monthlyMinimumNok,
      paid,
      capitalizedInterest,
      principalReduction,
      kpiAdjustment: 0,
      closingBalance: balance,
      arrears: 0,
      transitionProtected,
    });
  }
  return rows;
}
