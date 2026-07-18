import { createClient } from "@supabase/supabase-js";
import { summarizeFamilyEconomyRows } from "@/lib/business/family-economy";

export type HealthStatus = "ok" | "warning" | "error" | "missing" | "not_configured";

export type TableHealth = {
  schema: string;
  table: string;
  label: string;
  required: boolean;
  status: HealthStatus;
  count: number | null;
  error: string | null;
  latencyMs: number | null;
};

export type SchemaHealth = {
  id: "public" | "olivia" | "family";
  label: string;
  schema: string;
  host: string | null;
  configured: boolean;
  status: HealthStatus;
  tables: TableHealth[];
};

export type BusinessModuleHealth = {
  status: HealthStatus;
  sourceSchema: string | null;
  metrics: Record<string, number>;
  latestDate: string | null;
  warnings: string[];
};

export type DataHealthReport = {
  generatedAt: string;
  status: HealthStatus;
  environment: {
    mainHost: string | null;
    oliviaHost: string | null;
    familyHost: string | null;
    oliviaSchema: string;
    familySchema: string;
    usesServiceRole: boolean;
    legacyProjectDetected: boolean;
  };
  schemas: SchemaHealth[];
  modules: {
    b2b: BusinessModuleHealth;
    oliviaBatch: BusinessModuleHealth;
    familyResults: BusinessModuleHealth & { currency: "NOK" | "EUR" };
  };
  recommendations: string[];
};

type EnvConfig = {
  url: string;
  key: string;
  host: string | null;
};

type SupabaseClientLike = any;

type RowRead = {
  rows: Record<string, unknown>[];
  schema: string | null;
  error: string | null;
};

type CountResult = {
  error: unknown;
  count: number | null;
};

type RowsResult = {
  data: Record<string, unknown>[] | null;
  error: unknown;
};

const READ_TIMEOUT_MS = 8000;
const LEGACY_PROJECT_REF = "jvcdkclfcaccogmvvkrs";

const PUBLIC_TABLES = [
  { table: "business_financial_events", label: "Finance ledger", required: true },
  { table: "contacts", label: "CRM / pipeline", required: true },
  { table: "website_posts", label: "Doña Anna CMS", required: true },
  { table: "content_publications", label: "Content publications", required: false },
  { table: "social_accounts", label: "Social accounts", required: false },
  { table: "saas_apps", label: "SaaS apps", required: false },
  { table: "publishing_books", label: "Publishing books", required: false },
  { table: "transactions", label: "Family transactions fallback", required: false },
] as const;

const OLIVIA_TABLES = [
  { table: "farm_settings", label: "Farm settings", required: true },
  { table: "parcels", label: "Parcels", required: true },
  { table: "harvest_records", label: "Harvest records", required: true },
  { table: "farm_expenses", label: "Farm expenses", required: true },
  { table: "subsidy_income", label: "Subsidy income", required: true },
] as const;

const FAMILY_TABLES = [
  { table: "user_profiles", label: "Family users", required: true },
  { table: "economy_monthly", label: "Monthly economy view", required: true },
  { table: "transactions", label: "Family transactions", required: true },
  { table: "members", label: "Family members", required: false },
  { table: "real_estate_deals", label: "Family real estate notes", required: false },
  { table: "farm_operations", label: "Family farm notes", required: false },
  { table: "households", label: "Households", required: false },
] as const;

function cleanEnv(value: unknown): string {
  return String(value || "").trim().replace(/^[`'"]|[`'"]$/g, "").trim();
}

function firstEnv(keys: string[]): string {
  for (const key of keys) {
    const value = cleanEnv(process.env[key]);
    if (value) return value;
  }
  return "";
}

function hostFor(url: string): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

function mainConfig(): EnvConfig {
  const url = firstEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const key = firstEnv(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY", "SUPABASE_SECRET_KEY"]);
  return { url, key, host: hostFor(url) };
}

function oliviaConfig(main: EnvConfig): EnvConfig {
  const url = firstEnv(["OLIVIA_SUPABASE_URL", "DONAANNA_SUPABASE_URL", "DONA_ANNA_SUPABASE_URL"]) || main.url;
  const key = firstEnv([
    "OLIVIA_SUPABASE_SERVICE_ROLE_KEY",
    "OLIVIA_SUPABASE_KEY",
    "DONAANNA_SUPABASE_SERVICE_ROLE_KEY",
    "DONAANNA_SUPABASE_KEY",
    "DONA_ANNA_SUPABASE_SERVICE_ROLE_KEY",
    "DONA_ANNA_SUPABASE_KEY",
  ]) || main.key;
  return { url, key, host: hostFor(url) };
}

function familyConfig(main: EnvConfig): EnvConfig {
  const url = firstEnv(["FAMILY_SUPABASE_URL", "FAMILYHUB_SUPABASE_URL"]) || main.url;
  const key = firstEnv(["FAMILY_SUPABASE_SERVICE_ROLE_KEY", "FAMILY_SUPABASE_KEY"]) || main.key;
  return { url, key, host: hostFor(url) };
}

function createSupabase(config: EnvConfig) {
  if (!config.url || !config.key) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClientLike;
}

async function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timeout etter ${READ_TIMEOUT_MS / 1000}s`)), READ_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.code, record.message, record.details, record.hint].filter(Boolean).map(String).join(" ");
  }
  return String(error);
}

function isMissingError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("pgrst106") ||
    lower.includes("pgrst205") ||
    lower.includes("invalid schema") ||
    lower.includes("schema cache") ||
    lower.includes("does not exist") ||
    lower.includes("not found") ||
    lower.includes("could not find")
  );
}

function classifyError(message: string): HealthStatus {
  if (isMissingError(message)) return "missing";
  return "error";
}

function groupStatus(tables: TableHealth[], configured: boolean): HealthStatus {
  if (!configured) return "not_configured";
  if (tables.some((table) => table.required && table.status === "error")) return "error";
  if (tables.some((table) => table.required && table.status !== "ok")) return "warning";
  if (tables.some((table) => table.status === "error")) return "warning";
  if (tables.some((table) => table.status === "missing")) return "warning";
  return "ok";
}

async function probeTable(
  client: SupabaseClientLike | null,
  schema: string,
  table: string,
  label: string,
  required: boolean,
): Promise<TableHealth> {
  if (!client) {
    return { schema, table, label, required, status: "not_configured", count: null, error: "Supabase URL/key mangler", latencyMs: null };
  }

  const started = Date.now();
  try {
    const result = await withTimeout(
      client.schema(schema).from(table).select("*", { count: "exact" }).limit(0),
      `${schema}.${table}`,
    ) as CountResult;
    const error = result.error ? errorText(result.error) : "";
    if (error) {
      return {
        schema,
        table,
        label,
        required,
        status: classifyError(error),
        count: null,
        error,
        latencyMs: Date.now() - started,
      };
    }

    return {
      schema,
      table,
      label,
      required,
      status: "ok",
      count: result.count ?? 0,
      error: null,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    const message = errorText(error);
    return {
      schema,
      table,
      label,
      required,
      status: classifyError(message),
      count: null,
      error: message,
      latencyMs: Date.now() - started,
    };
  }
}

async function probeSchema(
  id: SchemaHealth["id"],
  label: string,
  config: EnvConfig,
  schema: string,
  tables: readonly { table: string; label: string; required: boolean }[],
): Promise<SchemaHealth> {
  const client = createSupabase(config);
  const tableHealth = await Promise.all(
    tables.map((table) => probeTable(client, schema, table.table, table.label, table.required)),
  );

  return {
    id,
    label,
    schema,
    host: config.host,
    configured: Boolean(config.url && config.key),
    status: groupStatus(tableHealth, Boolean(config.url && config.key)),
    tables: tableHealth,
  };
}

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  const normalized = raw.includes(",") && raw.lastIndexOf(",") > raw.lastIndexOf(".")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw.replace(/,/g, "");
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function dateValue(row: Record<string, unknown>, keys = ["updated_at", "created_at", "date", "event_date"]): string | null {
  const value = first(row, keys);
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function latestDate(rows: Record<string, unknown>[], keys?: string[]): string | null {
  return rows
    .map((row) => dateValue(row, keys))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;
}

async function readRowsFromSchemas(
  client: SupabaseClientLike | null,
  schemas: string[],
  table: string,
  limit = 1000,
): Promise<RowRead> {
  if (!client) return { rows: [], schema: null, error: "Supabase URL/key mangler" };

  let lastError = "";
  for (const schema of schemas) {
    try {
      const result = await withTimeout(client.schema(schema).from(table).select("*").limit(limit), `${schema}.${table}`) as RowsResult;
      if (!result.error) return { rows: result.data || [], schema, error: null };
      lastError = errorText(result.error);
    } catch (error) {
      lastError = errorText(error);
    }
  }

  return { rows: [], schema: null, error: lastError || `${table}: ingen schema svarte` };
}

function sumRows(rows: Record<string, unknown>[], keys: string[]): number {
  return rows.reduce((sum, row) => sum + numberValue(first(row, keys)), 0);
}

function findTable(schema: SchemaHealth | undefined, table: string): TableHealth | undefined {
  return schema?.tables.find((item) => item.table === table);
}

function okTable(schema: SchemaHealth | undefined, table: string): TableHealth | undefined {
  const health = findTable(schema, table);
  return health?.status === "ok" ? health : undefined;
}

async function readRowsIfPresent(
  client: SupabaseClientLike | null,
  schemas: string[],
  table: string,
  health?: TableHealth,
): Promise<RowRead> {
  if (health?.status === "ok" && health.count === 0) {
    return { rows: [], schema: health.schema, error: null };
  }

  const orderedSchemas = Array.from(new Set([health?.schema, ...schemas].filter((schema): schema is string => Boolean(schema))));
  return readRowsFromSchemas(client, orderedSchemas, table);
}

function amount(row: Record<string, unknown>, keys: string[]): number {
  return numberValue(first(row, keys));
}

function harvestRevenue(row: Record<string, unknown>): number {
  const direct = amount(row, ["total_revenue", "revenue", "amount", "total_amount"]);
  if (direct) return direct;
  return amount(row, ["kilograms", "kg", "weight", "harvest_kg"]) * amount(row, ["price_per_kg", "kg_price", "unit_price"]);
}

function moneyStatusRows(rows: Record<string, unknown>[], paidStatuses: string[]): Record<string, unknown>[] {
  const paid = new Set(paidStatuses.map((status) => status.toLowerCase()));
  return rows.filter((row) => !paid.has(String(first(row, ["status", "payment_status"]) || "").toLowerCase()));
}

async function readCanonicalCommerce(client: SupabaseClientLike | null) {
  if (!client) return { snapshot: null as Record<string, any> | null, error: "Supabase URL/key mangler" };
  try {
    const result = await withTimeout(
      client.rpc("donaanna_snapshot", { p_workspace_slug: "dona-anna" }),
      "public.donaanna_snapshot",
    ) as { data: Record<string, any> | null; error: unknown };
    if (result.error) return { snapshot: null, error: errorText(result.error) };
    return { snapshot: result.data, error: null };
  } catch (error) {
    return { snapshot: null, error: errorText(error) };
  }
}

async function buildB2BSummary(client: SupabaseClientLike | null): Promise<BusinessModuleHealth> {
  const canonical = await readCanonicalCommerce(client);
  if (!canonical.snapshot) {
    return {
      status: canonical.error && isMissingError(canonical.error) ? "missing" : "error",
      sourceSchema: null,
      metrics: { orders: 0, openOrders: 0, orderValue: 0, invoices: 0, unpaidInvoices: 0, unpaidInvoiceValue: 0, customers: 0, products: 0 },
      latestDate: null,
      warnings: [canonical.error || "Doña Anna commerce-kjernen svarte ikke"],
    };
  }
  const orders = Array.isArray(canonical.snapshot.orders) ? canonical.snapshot.orders as Record<string, unknown>[] : [];
  const customers = Array.isArray(canonical.snapshot.parties) ? canonical.snapshot.parties as Record<string, unknown>[] : [];
  const products = Array.isArray(canonical.snapshot.products) ? canonical.snapshot.products as Record<string, unknown>[] : [];
  const openOrders = moneyStatusRows(orders, ["fulfilled", "cancelled", "returned"]);
  const invoiced = orders.filter((order) => Boolean(order.billing_document_id));
  const unpaidInvoices = invoiced.filter((order) => String(order.payment_status || "") !== "paid");
  return {
    status: "ok",
    sourceSchema: "commerce (server RPC)",
    metrics: {
      orders: orders.length,
      openOrders: openOrders.length,
      orderValue: sumRows(orders, ["total"]),
      invoices: invoiced.length,
      unpaidInvoices: unpaidInvoices.length,
      unpaidInvoiceValue: sumRows(unpaidInvoices, ["total"]),
      customers: customers.length,
      products: products.length,
    },
    latestDate: latestDate(orders, ["updated_at", "ordered_at", "created_at"]),
    warnings: [],
  };
}

async function buildOliviaBatchSummary(client: SupabaseClientLike | null, canonicalClient: SupabaseClientLike | null, schemas: string[], schemaHealth?: SchemaHealth): Promise<BusinessModuleHealth> {
  const harvestHealth = okTable(schemaHealth, "harvest_records");
  const expenseHealth = okTable(schemaHealth, "farm_expenses");
  const subsidyHealth = okTable(schemaHealth, "subsidy_income");
  const parcelHealth = okTable(schemaHealth, "parcels");
  const [canonical, harvests, expenses, subsidies, parcels] = await Promise.all([
    readCanonicalCommerce(canonicalClient),
    readRowsIfPresent(client, schemas, "harvest_records", harvestHealth),
    readRowsIfPresent(client, schemas, "farm_expenses", expenseHealth),
    readRowsIfPresent(client, schemas, "subsidy_income", subsidyHealth),
    readRowsIfPresent(client, schemas, "parcels", parcelHealth),
  ]);
  const warnings = [harvests, expenses, subsidies, parcels]
    .filter((read) => read.error && isMissingError(read.error))
    .map((read) => read.error as string);
  if (canonical.error) warnings.push(canonical.error);
  const batches = Array.isArray(canonical.snapshot?.lots) ? canonical.snapshot?.lots as Record<string, unknown>[] : [];
  const activeBatches = batches.filter((row) => !["depleted", "recalled"].includes(String(first(row, ["status"]) || "").toLowerCase()));
  const harvestRevenueTotal = harvests.rows.reduce((sum, row) => sum + harvestRevenue(row), 0);
  const expensesTotal = sumRows(expenses.rows, ["amount", "cost", "total_amount"]);
  const subsidiesTotal = sumRows(subsidies.rows, ["amount", "total_amount"]);
  const sourceSchema = canonical.snapshot ? "commerce + olivia" : harvests.schema || expenses.schema || subsidies.schema || parcels.schema || harvestHealth?.schema || parcelHealth?.schema || null;
  const batchCount = batches.length;
  const harvestCount = harvestHealth?.count ?? harvests.rows.length;
  const parcelCount = parcelHealth?.count ?? parcels.rows.length;

  return {
    status: sourceSchema ? (warnings.length > 0 ? "warning" : "ok") : "missing",
    sourceSchema,
    metrics: {
      batches: batchCount,
      activeBatches: activeBatches.length,
      harvests: harvestCount,
      harvestKg: sumRows(harvests.rows, ["kilograms", "kg", "weight", "harvest_kg"]),
      harvestRevenue: harvestRevenueTotal,
      expenses: expensesTotal,
      subsidies: subsidiesTotal,
      net: harvestRevenueTotal + subsidiesTotal - expensesTotal,
      parcels: parcelCount,
      trees: sumRows(parcels.rows, ["tree_count", "trees", "olive_trees"]),
    },
    latestDate: latestDate([...batches, ...harvests.rows], ["updated_at", "harvest_date", "created_at", "date"]),
    warnings,
  };
}

async function buildFamilySummary(
  familyClient: SupabaseClientLike | null,
  mainClient: SupabaseClientLike | null,
  familySchema: string,
  familyHealth?: SchemaHealth,
): Promise<BusinessModuleHealth & { currency: "NOK" | "EUR" }> {
  const familyMonthlyHealth = okTable(familyHealth, "economy_monthly");
  const [familyMonthly, publicMonthly] = await Promise.all([
    readRowsIfPresent(familyClient, [familySchema], "economy_monthly", familyMonthlyHealth),
    readRowsFromSchemas(mainClient, ["public"], "family_economy_monthly"),
  ]);

  const monthlyRows = familyMonthly.rows.length > 0 ? familyMonthly.rows : publicMonthly.rows;
  if (monthlyRows.length > 0) {
    const summary = summarizeFamilyEconomyRows(monthlyRows);
    const warnings: string[] = [];
    if (summary.ignoredFutureRows > 0) {
      warnings.push(`Ignorerer ${summary.ignoredFutureRows} framtidsrad(er) etter ${summary.currentMonth}-01 i Family-resultat.`);
    }
    if (summary.ignoredPlannedRows > 0) {
      warnings.push(`Ignorerer ${summary.ignoredPlannedRows} plan-/budsjett-rad(er) i Family-resultat.`);
    }
    if (summary.ignoredRowsWithoutMonth > 0) {
      warnings.push(`Ignorerer ${summary.ignoredRowsWithoutMonth} Family-rad(er) uten gyldig måned.`);
    }
    if (summary.metrics.mondeoInterest !== 0) {
      warnings.push(
        "Mondeo rente her er Family-resultat, ikke registrert Mondeo-betaling eller KPI i RealtyFlow-ledger.",
      );
    }
    if (familyMonthly.rows.length === 0 && publicMonthly.error && isMissingError(publicMonthly.error)) {
      warnings.push(publicMonthly.error);
    }

    return {
      status: familyMonthly.rows.length > 0 && warnings.length === 0 ? "ok" : "warning",
      sourceSchema: familyMonthly.schema || publicMonthly.schema,
      currency: "NOK",
      metrics: summary.metrics,
      latestDate: summary.latestDate,
      warnings,
    };
  }

  const publicLedger = await readRowsFromSchemas(mainClient, ["public"], "business_financial_events");
  const ledgerRows = publicLedger.rows.filter((row) => {
    const status = String(first(row, ["status"]) || "").toLowerCase();
    return status === "recognized" || status === "paid";
  });
  const currentYear = new Date().getFullYear();
  const ytdLedger = ledgerRows.filter((row) => {
    const date = dateValue(row, ["event_date", "created_at"]);
    return date ? Number(date.slice(0, 4)) === currentYear : false;
  });
  const eventAmount = (row: Record<string, unknown>) => {
    const value = amount(row, ["amount"]);
    return String(first(row, ["direction"]) || "") === "expense" ? -value : value;
  };
  const oliviaRows = ytdLedger.filter((row) => String(first(row, ["source_type", "stream"]) || "").includes("olivia") || String(first(row, ["stream"]) || "").startsWith("olive_"));
  const realtyflowRows = ytdLedger.filter((row) => String(first(row, ["stream"]) || "") === "commission");

  return {
    status: ledgerRows.length > 0 ? "warning" : "missing",
    sourceSchema: publicLedger.schema,
    currency: "EUR",
    metrics: {
      months: 0,
      ytdTotal: ytdLedger.reduce((sum, row) => sum + eventAmount(row), 0),
      lastMonthTotal: 0,
      oliviaNet: oliviaRows.reduce((sum, row) => sum + eventAmount(row), 0),
      realtyflowNet: realtyflowRows.reduce((sum, row) => sum + eventAmount(row), 0),
      mondeoInterest: 0,
    },
    latestDate: latestDate(ledgerRows, ["event_date", "updated_at", "created_at"]),
    warnings: [
      familyMonthly.error || "family.economy_monthly mangler eller har ikke data",
      publicMonthly.error || "public.family_economy_monthly mangler eller har ikke data",
    ].filter(Boolean),
  };
}

function overallStatus(schemas: SchemaHealth[], modules: DataHealthReport["modules"]): HealthStatus {
  if (schemas.some((schema) => schema.status === "error" || schema.status === "not_configured")) return "error";
  if ([modules.b2b.status, modules.oliviaBatch.status, modules.familyResults.status].some((status) => status === "error" || status === "missing")) return "warning";
  if (schemas.some((schema) => schema.status === "warning") || [modules.b2b.status, modules.oliviaBatch.status, modules.familyResults.status].includes("warning")) return "warning";
  return "ok";
}

function buildRecommendations(report: Omit<DataHealthReport, "recommendations">): string[] {
  const recommendations: string[] = [];
  const familySchema = report.schemas.find((schema) => schema.id === "family");

  if (report.environment.legacyProjectDetected) {
    recommendations.push("Fjern gammel jvcdkclfcaccogmvvkrs Supabase fra env i lokal/Vercel slik at alle appene peker mot RealtyFlow-prosjektet.");
  }

  if (familySchema?.status === "error") {
    recommendations.push("Gi PostgREST tilgang til family schema: legg family i Exposed schemas og verifiser GRANT USAGE/SELECT for authenticated/service_role.");
  }

  if (report.modules.b2b.status !== "ok") {
    recommendations.push("Kjør eller kontroller Doña Anna commerce-migreringen og server-RPC-en donaanna_snapshot i RealtyFlow Supabase.");
  }

  if (report.modules.familyResults.status !== "ok") {
    recommendations.push("Klargjør family.economy_monthly som server-side kilde for Family-resultat, og bruk RealtyFlow ledger som fallback.");
  }

  if (!report.environment.usesServiceRole) {
    recommendations.push("Sett SUPABASE_SERVICE_ROLE_KEY i servermiljøet for nøyaktig Data Health. Anon-nøkkel kan bli stoppet av RLS.");
  }

  return recommendations;
}

export async function getDataHealth(): Promise<DataHealthReport> {
  const main = mainConfig();
  const olivia = oliviaConfig(main);
  const family = familyConfig(main);
  const oliviaSchema = firstEnv(["OLIVIA_SCHEMA", "DONAANNA_SCHEMA", "DONA_ANNA_SCHEMA"]) || "olivia";
  const familySchema = firstEnv(["FAMILY_SCHEMA", "FAMILYHUB_SCHEMA"]) || "family";
  const mainClient = createSupabase(main);
  const oliviaClient = createSupabase(olivia);
  const familyClient = createSupabase(family);
  const oliviaSchemas = Array.from(new Set([oliviaSchema, "olivia"].filter(Boolean)));

  const [publicSchema, oliviaSchemaHealth, familySchemaHealth] = await Promise.all([
    probeSchema("public", "RealtyFlow public", main, "public", PUBLIC_TABLES),
    probeSchema("olivia", "Olivia / Doña Anna", olivia, oliviaSchema, OLIVIA_TABLES),
    probeSchema("family", "FamilyHub", family, familySchema, FAMILY_TABLES),
  ]);

  const [b2b, oliviaBatch, familyResults] = await Promise.all([
    buildB2BSummary(mainClient),
    buildOliviaBatchSummary(oliviaClient, mainClient, oliviaSchemas, oliviaSchemaHealth),
    buildFamilySummary(familyClient, mainClient, familySchema, familySchemaHealth),
  ]);

  const partialReport: Omit<DataHealthReport, "recommendations"> = {
    generatedAt: new Date().toISOString(),
    status: "ok",
    environment: {
      mainHost: main.host,
      oliviaHost: olivia.host,
      familyHost: family.host,
      oliviaSchema,
      familySchema,
      usesServiceRole: Boolean(cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)),
      legacyProjectDetected: [main.url, olivia.url, family.url].some((url) => url.includes(LEGACY_PROJECT_REF)),
    },
    schemas: [publicSchema, oliviaSchemaHealth, familySchemaHealth],
    modules: {
      b2b,
      oliviaBatch,
      familyResults,
    },
  };

  const status = overallStatus(partialReport.schemas, partialReport.modules);
  const report = { ...partialReport, status };
  return {
    ...report,
    recommendations: buildRecommendations(report),
  };
}
