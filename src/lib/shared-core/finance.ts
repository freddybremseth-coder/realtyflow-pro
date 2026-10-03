export const BUSINESS_FINANCE_SOURCE_TYPES = [
  "crm",
  "kdp",
  "saas",
  "olivia",
  "manual",
  "family_mondeo",
] as const;

export const BUSINESS_FINANCE_STREAMS = [
  "commission",
  "sale_value",
  "kdp_royalty",
  "saas_revenue",
  "saas_mrr",
  "olive_harvest",
  "olive_subsidy",
  "olive_expense",
  "manual_adjustment",
  "kpi_adjustment",
  "mondeo_payment",
  "mondeo_balance",
  "mondeo_interest",
] as const;

export const BUSINESS_FINANCE_DIRECTIONS = ["income", "expense", "metric"] as const;
export const BUSINESS_FINANCE_STATUSES = ["pending", "recognized", "paid", "cancelled"] as const;

export type BusinessFinanceSourceType = (typeof BUSINESS_FINANCE_SOURCE_TYPES)[number];
export type BusinessFinanceStream = (typeof BUSINESS_FINANCE_STREAMS)[number];
export type BusinessFinanceDirection = (typeof BUSINESS_FINANCE_DIRECTIONS)[number];
export type BusinessFinanceStatus = (typeof BUSINESS_FINANCE_STATUSES)[number];

export type BusinessFinancialEventRow = {
  id?: string | null;
  brand_id?: string | null;
  source_type?: BusinessFinanceSourceType | string | null;
  source_id?: string | null;
  stream?: BusinessFinanceStream | string | null;
  direction?: BusinessFinanceDirection | string | null;
  status?: BusinessFinanceStatus | string | null;
  amount?: number | string | null;
  currency?: string | null;
  event_date?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  updated_at?: string | null;
};

export type BusinessFinancialEventWrite = {
  brand_id: string;
  source_type: BusinessFinanceSourceType;
  source_id: string;
  stream: BusinessFinanceStream;
  direction: BusinessFinanceDirection;
  status: BusinessFinanceStatus;
  amount: number;
  currency: string;
  event_date: string;
  description: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type FinanceSourceBoundary = {
  sourceType: BusinessFinanceSourceType;
  owner: "sales" | "content" | "platform" | "olivia" | "family" | "shared-core";
  mode: "canonical-sync" | "explicit-bridge" | "owner-entry";
  businessOnly: boolean;
  description: string;
};

export const FINANCE_SOURCE_BOUNDARIES: Record<BusinessFinanceSourceType, FinanceSourceBoundary> = {
  crm: {
    sourceType: "crm",
    owner: "sales",
    mode: "canonical-sync",
    businessOnly: true,
    description: "WON sales may synchronize verified sale value and commission into the shared ledger.",
  },
  kdp: {
    sourceType: "kdp",
    owner: "content",
    mode: "canonical-sync",
    businessOnly: true,
    description: "Publishing royalties synchronize as business income without creating a second publishing ledger.",
  },
  saas: {
    sourceType: "saas",
    owner: "platform",
    mode: "canonical-sync",
    businessOnly: true,
    description: "SaaS revenue and MRR synchronize into the shared ledger while product analytics stay in SaaS.",
  },
  olivia: {
    sourceType: "olivia",
    owner: "olivia",
    mode: "explicit-bridge",
    businessOnly: true,
    description: "Only explicit farm-business adapters may mirror harvest, subsidy and expense events from Olivia.",
  },
  manual: {
    sourceType: "manual",
    owner: "shared-core",
    mode: "owner-entry",
    businessOnly: true,
    description: "Manual adjustments are explicit business entries; they are never inferred from unrelated personal data.",
  },
  family_mondeo: {
    sourceType: "family_mondeo",
    owner: "family",
    mode: "explicit-bridge",
    businessOnly: true,
    description: "Family remains master for Mondeo; only the dedicated Mondeo payment/snapshot bridge enters RealtyFlow Finance.",
  },
};

export function financeMoney(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function financeCurrency(value: unknown) {
  return String(value || "EUR").trim().toUpperCase() || "EUR";
}

export function financeDateOnly(value: unknown) {
  const raw = String(value || "").trim();
  return raw ? raw.slice(0, 10) : null;
}

export function financeEventDate(value: unknown, fallback = new Date()) {
  return financeDateOnly(value) || fallback.toISOString().slice(0, 10);
}

export function financialEventKey(event: Pick<BusinessFinancialEventRow, "source_type" | "source_id" | "stream">) {
  return `${String(event.source_type || "unknown")}:${String(event.source_id || "unknown")}:${String(event.stream || "unknown")}`;
}

export function isBookableFinancialEvent(event: Pick<BusinessFinancialEventRow, "direction" | "status">) {
  const direction = String(event.direction || "").toLowerCase();
  const status = String(event.status || "").toLowerCase();
  return (direction === "income" || direction === "expense") && status !== "cancelled";
}

export function financeSourceBoundary(sourceType: string | null | undefined) {
  if (!sourceType) return null;
  return FINANCE_SOURCE_BOUNDARIES[sourceType as BusinessFinanceSourceType] || null;
}
