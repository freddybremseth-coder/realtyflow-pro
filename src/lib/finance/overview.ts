export type FinanceEvent = {
  id?: string | null;
  brand_id?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  stream?: string | null;
  direction?: string | null;
  status?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  event_date?: string | null;
  description?: string | null;
};

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

export type FinanceOverview = {
  generatedAt: string;
  currencies: Record<string, {
    income: number;
    expense: number;
    net: number;
    paid: number;
    pending: number;
    invoiced: number;
    outstanding: number;
    payments: number;
  }>;
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
  outstandingInvoiceCount: number;
  overdueInvoiceCount: number;
  latestEventDate: string | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function currency(value: unknown) {
  return String(value || "EUR").trim().toUpperCase() || "EUR";
}

function dateOnly(value: unknown) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 10) : null;
}

function ensureCurrency(target: FinanceOverview["currencies"], code: string) {
  target[code] ||= {
    income: 0,
    expense: 0,
    net: 0,
    paid: 0,
    pending: 0,
    invoiced: 0,
    outstanding: 0,
    payments: 0,
  };
  return target[code];
}

export function buildFinanceOverview(params: {
  events?: FinanceEvent[];
  documents?: BillingDocumentRow[];
  payments?: BillingPaymentRow[];
  now?: Date;
}): FinanceOverview {
  const now = params.now || new Date();
  const events = params.events || [];
  const documents = params.documents || [];
  const payments = params.payments || [];
  const currencies: FinanceOverview["currencies"] = {};
  const brandMap = new Map<string, FinanceOverview["brands"][number]>();
  const sourceCounts: Record<string, number> = {};
  let latestEventDate: string | null = null;

  for (const event of events) {
    const amount = numberValue(event.amount);
    const code = currency(event.currency);
    const bucket = ensureCurrency(currencies, code);
    const direction = String(event.direction || "").toLowerCase();
    const status = String(event.status || "").toLowerCase();
    const eventDate = dateOnly(event.event_date);
    const brandId = String(event.brand_id || "unassigned").trim() || "unassigned";
    const source = String(event.source_type || "unknown").trim() || "unknown";

    if (direction === "income") bucket.income += amount;
    if (direction === "expense") bucket.expense += amount;
    bucket.net = bucket.income - bucket.expense;
    if (status === "paid") bucket.paid += amount;
    if (["pending", "recognized"].includes(status)) bucket.pending += amount;

    const brand = brandMap.get(brandId) || {
      brandId,
      income: 0,
      expense: 0,
      net: 0,
      eventCount: 0,
      latestDate: null,
    };
    if (direction === "income") brand.income += amount;
    if (direction === "expense") brand.expense += amount;
    brand.net = brand.income - brand.expense;
    brand.eventCount += 1;
    if (eventDate && (!brand.latestDate || eventDate > brand.latestDate)) brand.latestDate = eventDate;
    brandMap.set(brandId, brand);

    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    if (eventDate && (!latestEventDate || eventDate > latestEventDate)) latestEventDate = eventDate;
  }

  let outstandingInvoiceCount = 0;
  let overdueInvoiceCount = 0;
  const today = now.toISOString().slice(0, 10);

  for (const document of documents) {
    const type = String(document.document_type || "").toLowerCase();
    if (type && !["invoice", "credit_note", "credit-note"].includes(type)) continue;
    const code = currency(document.currency);
    const bucket = ensureCurrency(currencies, code);
    const total = numberValue(document.total);
    const balance = numberValue(document.balance);
    bucket.invoiced += total;
    bucket.outstanding += Math.max(0, balance);
    if (balance > 0) {
      outstandingInvoiceCount += 1;
      const dueDate = dateOnly(document.due_date);
      if (dueDate && dueDate < today) overdueInvoiceCount += 1;
    }
  }

  for (const payment of payments) {
    const code = currency(payment.currency);
    ensureCurrency(currencies, code).payments += numberValue(payment.amount);
  }

  for (const bucket of Object.values(currencies)) {
    bucket.income = Math.round(bucket.income * 100) / 100;
    bucket.expense = Math.round(bucket.expense * 100) / 100;
    bucket.net = Math.round(bucket.net * 100) / 100;
    bucket.paid = Math.round(bucket.paid * 100) / 100;
    bucket.pending = Math.round(bucket.pending * 100) / 100;
    bucket.invoiced = Math.round(bucket.invoiced * 100) / 100;
    bucket.outstanding = Math.round(bucket.outstanding * 100) / 100;
    bucket.payments = Math.round(bucket.payments * 100) / 100;
  }

  const brands = [...brandMap.values()]
    .map((brand) => ({
      ...brand,
      income: Math.round(brand.income * 100) / 100,
      expense: Math.round(brand.expense * 100) / 100,
      net: Math.round(brand.net * 100) / 100,
    }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.brandId.localeCompare(b.brandId));

  return {
    generatedAt: now.toISOString(),
    currencies,
    brands,
    sourceCounts,
    eventCount: events.length,
    outstandingInvoiceCount,
    overdueInvoiceCount,
    latestEventDate,
  };
}
