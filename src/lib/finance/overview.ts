import {
  financeCurrency,
  financeDateOnly,
  financeMoney,
  type BusinessFinancialEventRow,
} from "@/lib/shared-core/finance";

export type FinanceEvent = BusinessFinancialEventRow;

export type BillingDocumentRow = {
  id?: string | null;
  status?: string | null;
  document_type?: string | null;
  currency?: string | null;
  total?: number | string | null;
  amount_paid?: number | string | null;
  balance?: number | string | null;
  due_date?: string | null;
};

export type BillingPaymentRow = {
  id?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  payment_date?: string | null;
};

export type FinanceCurrencySummary = {
  income: number;
  expense: number;
  net: number;
  cashIn: number;
  cashOut: number;
  cashNet: number;
  accruedIncome: number;
  accruedExpense: number;
  accruedNet: number;
  forecastIncome: number;
  forecastExpense: number;
  forecastNet: number;
  paid: number;
  pending: number;
  invoiced: number;
  outstanding: number;
  payments: number;
};

export type FinanceOverview = {
  generatedAt: string;
  asOfDate: string;
  currencies: Record<string, FinanceCurrencySummary>;
  brands: Array<{
    brandId: string;
    income: number;
    expense: number;
    net: number;
    eventCount: number;
    latestDate: string | null;
  }>;
  sourceCounts: Record<string, number>;
  eventCount: number;
  actualEventCount: number;
  forecastEventCount: number;
  cancelledEventCount: number;
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  latestEventDate: string | null;
  nextForecastEventDate: string | null;
  mondeo: {
    currency: "NOK";
    asOfDate: string | null;
    currentBalance: number;
    cashPayments: number;
    capitalizedInterest: number;
    totalInterestIncome: number;
  } | null;
};

function ensureCurrency(target: FinanceOverview["currencies"], code: string) {
  target[code] ||= {
    income: 0,
    expense: 0,
    net: 0,
    cashIn: 0,
    cashOut: 0,
    cashNet: 0,
    accruedIncome: 0,
    accruedExpense: 0,
    accruedNet: 0,
    forecastIncome: 0,
    forecastExpense: 0,
    forecastNet: 0,
    paid: 0,
    pending: 0,
    invoiced: 0,
    outstanding: 0,
    payments: 0,
  };
  return target[code];
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function isOnOrBefore(eventDate: string | null, today: string) {
  return !eventDate || eventDate <= today;
}

export function buildFinanceOverview(params: {
  events?: FinanceEvent[];
  documents?: BillingDocumentRow[];
  payments?: BillingPaymentRow[];
  now?: Date;
}): FinanceOverview {
  const now = params.now || new Date();
  const today = now.toISOString().slice(0, 10);
  const events = params.events || [];
  const documents = params.documents || [];
  const payments = params.payments || [];
  const currencies: FinanceOverview["currencies"] = {};
  const brandMap = new Map<string, FinanceOverview["brands"][number]>();
  const sourceCounts: Record<string, number> = {};

  let latestEventDate: string | null = null;
  let nextForecastEventDate: string | null = null;
  let actualEventCount = 0;
  let forecastEventCount = 0;
  let cancelledEventCount = 0;

  let mondeoAsOfDate: string | null = null;
  let mondeoCurrentBalance = 0;
  let mondeoCashPayments = 0;
  let mondeoCapitalizedInterest = 0;
  let hasMondeo = false;

  for (const event of events) {
    const amount = financeMoney(event.amount);
    const code = financeCurrency(event.currency);
    const bucket = ensureCurrency(currencies, code);
    const direction = String(event.direction || "").toLowerCase();
    const status = String(event.status || "").toLowerCase();
    const stream = String(event.stream || "").toLowerCase();
    const eventDate = financeDateOnly(event.event_date);
    const brandId = String(event.brand_id || "unassigned").trim() || "unassigned";
    const source = String(event.source_type || "unknown").trim() || "unknown";
    const isCancelled = status === "cancelled";
    const isFuture = Boolean(eventDate && eventDate > today);
    const isPending = status === "pending";
    const isForecast = !isCancelled && (isFuture || isPending);
    const isActual = !isCancelled && !isPending && isOnOrBefore(eventDate, today);
    const isFinancialDirection = direction === "income" || direction === "expense";
    const isCash = isActual && isFinancialDirection && (status === "paid" || stream === "mondeo_payment");
    const isAccrued = isActual && isFinancialDirection && status === "recognized" && stream !== "mondeo_payment";

    if (isCancelled) cancelledEventCount += 1;
    else if (isForecast) forecastEventCount += 1;
    else if (isActual) actualEventCount += 1;

    if (isActual && isFinancialDirection) {
      if (direction === "income") bucket.income += amount;
      if (direction === "expense") bucket.expense += amount;
      bucket.net = bucket.income - bucket.expense;
    }

    if (isCash) {
      if (direction === "income") bucket.cashIn += amount;
      if (direction === "expense") bucket.cashOut += amount;
      bucket.cashNet = bucket.cashIn - bucket.cashOut;
      bucket.paid += amount;
    }

    if (isAccrued) {
      if (direction === "income") bucket.accruedIncome += amount;
      if (direction === "expense") bucket.accruedExpense += amount;
      bucket.accruedNet = bucket.accruedIncome - bucket.accruedExpense;
    }

    if (isForecast && isFinancialDirection) {
      if (direction === "income") bucket.forecastIncome += amount;
      if (direction === "expense") bucket.forecastExpense += amount;
      bucket.forecastNet = bucket.forecastIncome - bucket.forecastExpense;
      bucket.pending += amount;

      if (eventDate && (!nextForecastEventDate || eventDate < nextForecastEventDate)) {
        nextForecastEventDate = eventDate;
      }
    }

    const brand = brandMap.get(brandId) || {
      brandId,
      income: 0,
      expense: 0,
      net: 0,
      eventCount: 0,
      latestDate: null,
    };

    if (isActual && direction === "income") brand.income += amount;
    if (isActual && direction === "expense") brand.expense += amount;
    brand.net = brand.income - brand.expense;
    brand.eventCount += 1;

    if (isActual && eventDate && (!brand.latestDate || eventDate > brand.latestDate)) {
      brand.latestDate = eventDate;
    }
    brandMap.set(brandId, brand);

    sourceCounts[source] = (sourceCounts[source] || 0) + 1;

    if (isActual && eventDate && (!latestEventDate || eventDate > latestEventDate)) {
      latestEventDate = eventDate;
    }

    if (source === "family_mondeo" || brandId === "mondeo") {
      hasMondeo = true;
      if (isActual && eventDate && (!mondeoAsOfDate || eventDate > mondeoAsOfDate)) {
        mondeoAsOfDate = eventDate;
      }
      if (isActual && stream === "mondeo_balance" && direction === "metric") {
        mondeoCurrentBalance += amount;
      }
      if (isActual && stream === "mondeo_payment" && direction === "income") {
        mondeoCashPayments += amount;
      }
      if (isActual && stream === "mondeo_interest" && direction === "income") {
        mondeoCapitalizedInterest += amount;
      }
    }
  }

  let outstandingInvoiceCount = 0;
  let overdueInvoiceCount = 0;

  for (const document of documents) {
    const type = String(document.document_type || "").toLowerCase();
    if (type && !["invoice", "credit_note", "credit-note"].includes(type)) continue;
    const code = financeCurrency(document.currency);
    const bucket = ensureCurrency(currencies, code);
    const total = financeMoney(document.total);
    const balance = financeMoney(document.balance);
    bucket.invoiced += total;
    bucket.outstanding += Math.max(0, balance);

    if (balance > 0) {
      outstandingInvoiceCount += 1;
      const dueDate = financeDateOnly(document.due_date);
      if (dueDate && dueDate < today) overdueInvoiceCount += 1;
    }
  }

  for (const payment of payments) {
    const code = financeCurrency(payment.currency);
    ensureCurrency(currencies, code).payments += financeMoney(payment.amount);
  }

  for (const bucket of Object.values(currencies)) {
    bucket.income = roundMoney(bucket.income);
    bucket.expense = roundMoney(bucket.expense);
    bucket.net = roundMoney(bucket.net);
    bucket.cashIn = roundMoney(bucket.cashIn);
    bucket.cashOut = roundMoney(bucket.cashOut);
    bucket.cashNet = roundMoney(bucket.cashNet);
    bucket.accruedIncome = roundMoney(bucket.accruedIncome);
    bucket.accruedExpense = roundMoney(bucket.accruedExpense);
    bucket.accruedNet = roundMoney(bucket.accruedNet);
    bucket.forecastIncome = roundMoney(bucket.forecastIncome);
    bucket.forecastExpense = roundMoney(bucket.forecastExpense);
    bucket.forecastNet = roundMoney(bucket.forecastNet);
    bucket.paid = roundMoney(bucket.paid);
    bucket.pending = roundMoney(bucket.pending);
    bucket.invoiced = roundMoney(bucket.invoiced);
    bucket.outstanding = roundMoney(bucket.outstanding);
    bucket.payments = roundMoney(bucket.payments);
  }

  const brands = [...brandMap.values()]
    .map((brand) => ({
      ...brand,
      income: roundMoney(brand.income),
      expense: roundMoney(brand.expense),
      net: roundMoney(brand.net),
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.brandId.localeCompare(b.brandId));

  return {
    generatedAt: now.toISOString(),
    asOfDate: today,
    currencies,
    brands,
    sourceCounts,
    eventCount: events.length,
    actualEventCount,
    forecastEventCount,
    cancelledEventCount,
    outstandingInvoiceCount,
    overdueInvoiceCount,
    latestEventDate,
    nextForecastEventDate,
    mondeo: hasMondeo
      ? {
          currency: "NOK",
          asOfDate: mondeoAsOfDate,
          currentBalance: roundMoney(mondeoCurrentBalance),
          cashPayments: roundMoney(mondeoCashPayments),
          capitalizedInterest: roundMoney(mondeoCapitalizedInterest),
          totalInterestIncome: roundMoney(mondeoCashPayments + mondeoCapitalizedInterest),
        }
      : null,
  };
}
