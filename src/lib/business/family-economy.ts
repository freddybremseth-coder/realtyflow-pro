export type FamilyEconomyMetrics = {
  months: number;
  ytdTotal: number;
  lastMonthTotal: number;
  oliviaNet: number;
  realtyflowNet: number;
  mondeoInterest: number;
};

export type FamilyEconomySummary = {
  currentMonth: string;
  latestDate: string | null;
  includedRows: number;
  sourceRows: number;
  ignoredFutureRows: number;
  ignoredPlannedRows: number;
  ignoredRowsWithoutMonth: number;
  metrics: FamilyEconomyMetrics;
};

type FamilyRow = Record<string, unknown>;

function first(row: FamilyRow, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function familyNumberValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  const normalized = raw.includes(",") && raw.lastIndexOf(",") > raw.lastIndexOf(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function currentMonthKey(asOf: Date) {
  return `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromValue(value: unknown): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : null;
}

export function familyMonthKey(row: FamilyRow): string | null {
  return monthKeyFromValue(first(row, ["month", "period", "date", "event_date", "created_at"]));
}

function isTruthy(value: unknown) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined || value === "") return false;
  return ["true", "1", "yes", "ja"].includes(String(value).trim().toLowerCase());
}

function isPlannedFamilyRow(row: FamilyRow) {
  if (isTruthy(first(row, ["is_forecast", "isForecast", "forecast", "is_budget", "isBudget"]))) return true;
  const state = String(first(row, ["status", "state", "type", "kind"]) || "").toLowerCase();
  return ["forecast", "planned", "plan", "budget", "projection", "prognose"].some((token) => state.includes(token));
}

export function familyMonthlyTotalNok(row: FamilyRow): number {
  const direct = familyNumberValue(first(row, ["total_net_nok", "totalNetNok", "total_nok", "net_nok"]));
  if (direct) return direct;
  return (
    familyNumberValue(first(row, ["olivia_net_nok", "oliviaNetNok"])) +
    familyNumberValue(first(row, ["realtyflow_net_nok", "realtyflowNetNok"])) +
    familyNumberValue(first(row, ["mondeo_interest_nok", "mondeoInterestNok"]))
  );
}

export function summarizeFamilyEconomyRows(rows: FamilyRow[], asOf = new Date()): FamilyEconomySummary {
  const currentMonth = currentMonthKey(asOf);
  const buckets = new Map<string, { rows: number; total: number; oliviaNet: number; realtyflowNet: number; mondeoInterest: number }>();
  let ignoredFutureRows = 0;
  let ignoredPlannedRows = 0;
  let ignoredRowsWithoutMonth = 0;

  for (const row of rows) {
    const month = familyMonthKey(row);
    if (!month) {
      ignoredRowsWithoutMonth += 1;
      continue;
    }
    if (month > currentMonth) {
      ignoredFutureRows += 1;
      continue;
    }
    if (isPlannedFamilyRow(row)) {
      ignoredPlannedRows += 1;
      continue;
    }

    const bucket = buckets.get(month) || { rows: 0, total: 0, oliviaNet: 0, realtyflowNet: 0, mondeoInterest: 0 };
    bucket.rows += 1;
    bucket.total += familyMonthlyTotalNok(row);
    bucket.oliviaNet += familyNumberValue(first(row, ["olivia_net_nok", "oliviaNetNok"]));
    bucket.realtyflowNet += familyNumberValue(first(row, ["realtyflow_net_nok", "realtyflowNetNok"]));
    bucket.mondeoInterest += familyNumberValue(first(row, ["mondeo_interest_nok", "mondeoInterestNok"]));
    buckets.set(month, bucket);
  }

  const sortedMonths = Array.from(buckets.entries())
    .map(([month, value]) => ({ month, ...value }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const currentYear = Number(currentMonth.slice(0, 4));
  const ytdMonths = sortedMonths.filter((row) => Number(row.month.slice(0, 4)) === currentYear);

  return {
    currentMonth,
    latestDate: sortedMonths.at(-1)?.month ? `${sortedMonths.at(-1)?.month}-01` : null,
    includedRows: sortedMonths.reduce((sum, row) => sum + row.rows, 0),
    sourceRows: rows.length,
    ignoredFutureRows,
    ignoredPlannedRows,
    ignoredRowsWithoutMonth,
    metrics: {
      months: sortedMonths.length,
      ytdTotal: ytdMonths.reduce((sum, row) => sum + row.total, 0),
      lastMonthTotal: sortedMonths.at(-1)?.total || 0,
      oliviaNet: ytdMonths.reduce((sum, row) => sum + row.oliviaNet, 0),
      realtyflowNet: ytdMonths.reduce((sum, row) => sum + row.realtyflowNet, 0),
      mondeoInterest: ytdMonths.reduce((sum, row) => sum + row.mondeoInterest, 0),
    },
  };
}
