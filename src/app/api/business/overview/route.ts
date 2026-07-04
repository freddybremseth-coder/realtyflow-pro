import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";
import { summarizeFamilyMondeoTransactions } from "@/lib/business/family-economy";
import { MONDEO_CONTRACT } from "@/lib/mondeo";
import { normalizeBrandId } from "@/lib/realty/brand-rules";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type BrandData = {
  brandId: string;
  revenue: string;
  revenueAmount: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionPending: number;
  wonDeals: number;
  customers: number;
  totalPosts: number;
  publishedPosts: number;
  connectedAccounts: number;
  pipelineLeads: number;
  crmContacts: number;
  growthActions: number;
  saasApps: number;
  saasMrr: number;
  saasRevenue: number;
  publishingBooks: number;
  publishingOrders: number;
  publishingRoyalties: number;
  oliviaRevenue: number;
  oliviaNetProfit: number;
  financialIncome: number;
  financialExpense: number;
  financialNet: number;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function getOliviaSupabase() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OLIVIA_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function getFamilySupabase() {
  const url = process.env.FAMILY_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.FAMILY_SUPABASE_SERVICE_ROLE_KEY || process.env.FAMILY_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function safeRows<T>(result: PromiseSettledResult<{ data: T[] | null }>) {
  return result.status === "fulfilled" ? result.value.data || [] : [];
}

function settledError(result: PromiseSettledResult<{ error: { message: string } | null }>) {
  if (result.status === "rejected") return result.reason instanceof Error ? result.reason.message : String(result.reason);
  return result.value.error?.message || null;
}

function isCriticalOliviaTableError(message: string | null) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("relation") ||
    m.includes("permission denied")
  );
}

function getOliviaHost() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

function getOliviaSchemaCandidates() {
  const configured = String(process.env.OLIVIA_SCHEMA || "").trim();
  const ordered = [configured, "olivia", "public"].filter(Boolean);
  return Array.from(new Set(ordered));
}

function getFamilySchemaCandidates() {
  const configured = String(process.env.FAMILY_SCHEMA || process.env.FAMILYHUB_SCHEMA || "").trim();
  const ordered = [configured, "family", "public"].filter(Boolean);
  return Array.from(new Set(ordered));
}

async function queryOliviaTable(
  supabase: any,
  table: string,
  selectClause: string,
  options?: { orderBy?: string; ascending?: boolean; limit?: number; single?: boolean },
) {
  let lastError: any = null;
  for (const schemaName of getOliviaSchemaCandidates()) {
    let q = supabase.schema(schemaName).from(table).select(selectClause);
    if (options?.orderBy) q = q.order(options.orderBy, { ascending: options.ascending ?? false });
    if (options?.limit) q = q.limit(options.limit);
    if (options?.single) {
      const { data, error } = await q.single();
      if (!error) return { data, error: null, schema: schemaName };
      lastError = error;
      continue;
    }
    const { data, error } = await q;
    if (!error) return { data, error: null, schema: schemaName };
    lastError = error;
  }
  return { data: options?.single ? null : [], error: lastError, schema: null };
}

async function queryFamilyTable(
  supabase: any,
  table: string,
  selectClause: string,
  options?: { orderBy?: string; ascending?: boolean; limit?: number },
) {
  let lastError: any = null;
  for (const schemaName of getFamilySchemaCandidates()) {
    let q = supabase.schema(schemaName).from(table).select(selectClause);
    if (options?.orderBy) q = q.order(options.orderBy, { ascending: options.ascending ?? false });
    if (options?.limit) q = q.limit(options.limit);
    const { data, error } = await q;
    if (!error) return { data: data || [], error: null, schema: schemaName };
    lastError = error;
  }
  return { data: [], error: lastError, schema: null };
}

function formatRevenue(value: number, currency = "EUR") {
  if (!value) return "Ikke tilgjengelig";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function getBrandRevenueCurrency(brandId: string) {
  if (brandId === "mondeo") return "NOK";
  if (brandId === "chatgenius" || brandId === "freddypublishing") return "USD";
  return "EUR";
}

async function getOliviaData() {
  const supabase = getOliviaSupabase();
  if (!supabase) return null;

  const [harvestRes, expenseRes, subsidyRes, parcelRes, settingsRes] = await Promise.allSettled([
    queryOliviaTable(supabase, "harvest_records", "*", { orderBy: "harvest_date", ascending: false }),
    queryOliviaTable(supabase, "farm_expenses", "*", { orderBy: "date", ascending: false }),
    queryOliviaTable(supabase, "subsidy_income", "*", { orderBy: "date", ascending: false }),
    queryOliviaTable(supabase, "parcels", "id, name, area, municipality, crop_type, tree_count"),
    queryOliviaTable(supabase, "farm_settings", "*", { limit: 1, single: true }),
  ]);

  const harvests = safeRows<Record<string, unknown>>(harvestRes as any);
  const expenses = safeRows<Record<string, unknown>>(expenseRes as any);
  const subsidies = safeRows<Record<string, unknown>>(subsidyRes as any);
  const parcels = safeRows<Record<string, unknown>>(parcelRes as any);
  const settings = settingsRes.status === "fulfilled" ? (settingsRes.value as any).data : null;
  const tableErrors = {
    harvest_records: settledError(harvestRes as any),
    farm_expenses: settledError(expenseRes as any),
    subsidy_income: settledError(subsidyRes as any),
    parcels: settledError(parcelRes as any),
    farm_settings: settledError(settingsRes as any),
  };
  const warnings = Object.entries(tableErrors)
    .filter(([, message]) => isCriticalOliviaTableError(message))
    .map(([table, message]) => `${table}: ${message}`);

  const totalRevenue = harvests.reduce((sum, row) => sum + (Number(row.kilograms) || 0) * (Number(row.price_per_kg) || 0), 0);
  const totalHarvestKg = harvests.reduce((sum, row) => sum + (Number(row.kilograms) || 0), 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const totalSubsidies = subsidies.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const netProfit = totalRevenue + totalSubsidies - totalExpenses;

  const expensesByCategory: Record<string, number> = {};
  for (const row of expenses) {
    const category = String(row.category || "Annet");
    expensesByCategory[category] = (expensesByCategory[category] || 0) + (Number(row.amount) || 0);
  }

  const harvestsBySeason: Record<string, { kg: number; revenue: number }> = {};
  for (const row of harvests) {
    const season = String(row.season || "Ukjent");
    harvestsBySeason[season] ||= { kg: 0, revenue: 0 };
    harvestsBySeason[season].kg += Number(row.kilograms) || 0;
    harvestsBySeason[season].revenue += (Number(row.kilograms) || 0) * (Number(row.price_per_kg) || 0);
  }

  return {
    source: "supabase",
    supabaseHost: getOliviaHost(),
    schemaCandidates: getOliviaSchemaCandidates(),
    resolvedSchema:
      (harvestRes.status === "fulfilled" && (harvestRes.value as any).schema) ||
      (settingsRes.status === "fulfilled" && (settingsRes.value as any).schema) ||
      null,
    configuredSeparateOliviaDb: Boolean(process.env.OLIVIA_SUPABASE_URL && process.env.OLIVIA_SUPABASE_KEY),
    warnings,
    tableErrors,
    farmName: (settings as Record<string, unknown> | null)?.farm_name || "DonaAnna",
    currency: (settings as Record<string, unknown> | null)?.currency || "EUR",
    parcels: {
      count: parcels.length,
      totalArea: parcels.reduce((sum, row) => sum + (Number(row.area) || 0), 0),
      totalTrees: parcels.reduce((sum, row) => sum + (Number(row.tree_count) || 0), 0),
    },
    financials: {
      totalRevenue,
      totalExpenses,
      totalSubsidies,
      netProfit,
      totalHarvestKg,
      harvestCount: harvests.length,
    },
    expensesByCategory,
    harvestsBySeason,
    recentHarvests: harvests.slice(0, 5),
    recentExpenses: expenses.slice(0, 5),
  };
}

async function getFamilyMondeoData() {
  const supabase = getFamilySupabase();
  if (!supabase) {
    return {
      payments: [],
      totalPaid: 0,
      schema: null as string | null,
      warnings: ["Family Supabase er ikke konfigurert, så Mondeo-fallback er deaktivert."],
    };
  }

  const result = await queryFamilyTable(
    supabase,
    "transactions",
    "id, date, amount, currency, type, category, description, payment_method, is_accrual, created_at",
    { orderBy: "date", ascending: false, limit: 1000 },
  );
  const warning = result.error ? `Kunne ikke lese family.transactions for Mondeo: ${result.error.message || String(result.error)}` : null;
  const summary = summarizeFamilyMondeoTransactions((result.data || []) as Record<string, unknown>[]);

  return {
    ...summary,
    schema: result.schema,
    warnings: warning ? [warning] : [],
  };
}

function emptyBrandData(brandId: string): BrandData {
  return {
    brandId,
    revenue: "Ikke tilgjengelig",
    revenueAmount: 0,
    commissionTotal: 0,
    commissionPaid: 0,
    commissionPending: 0,
    wonDeals: 0,
    customers: 0,
    totalPosts: 0,
    publishedPosts: 0,
    connectedAccounts: 0,
    pipelineLeads: 0,
    crmContacts: 0,
    growthActions: 0,
    saasApps: 0,
    saasMrr: 0,
    saasRevenue: 0,
    publishingBooks: 0,
    publishingOrders: 0,
    publishingRoyalties: 0,
    oliviaRevenue: 0,
    oliviaNetProfit: 0,
    financialIncome: 0,
    financialExpense: 0,
    financialNet: 0,
  };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, {
    brandDataMap: {},
    totals: { totalPosts: 0, publishedPosts: 0, connectedAccounts: 0, totalBrands: BRANDS.length, pipelineLeads: 0, crmContacts: 0 },
    oliviaData: null,
  });
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      brandDataMap: Object.fromEntries(BRANDS.map((brand) => [brand.id, emptyBrandData(brand.id)])),
      totals: { totalPosts: 0, publishedPosts: 0, connectedAccounts: 0, totalBrands: BRANDS.length, pipelineLeads: 0, crmContacts: 0 },
      oliviaData: null,
      source: "not-configured",
    });
  }

  const [contentRes, accountsRes, contactsRes, actionsRes, saasRes, publishingRes, ledgerRes, oliviaData, familyMondeoData] = await Promise.all([
    supabase.from("content_publications").select("id, brand_id, brand, status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("social_accounts").select("id, brand, brand_id, is_active"),
    supabase.from("contacts").select("id, brand_id, pipeline_status, pipeline_value, sale_price, commission_amount, commission_paid_date"),
    supabase.from("growth_actions").select("id, brand, brand_id, status, created_at, updated_at"),
    supabase.from("saas_apps").select("id, slug, name, status, total_users, active_users_30d, total_revenue, mrr, arr"),
    supabase.from("publishing_books").select("id, brand_id, title, orders, royalties, ad_spend, reviews_count, role, status"),
    supabase.from("business_financial_events").select("id, brand_id, source_type, stream, direction, status, amount, currency, event_date"),
    getOliviaData(),
    getFamilyMondeoData(),
  ]);

  const publications: Record<string, any>[] = contentRes.data || [];
  const socialAccounts: Record<string, any>[] = accountsRes.data || [];
  const contacts: Record<string, any>[] = contactsRes.data || [];
  const growthActions: Record<string, any>[] = actionsRes.data || [];
  const saasApps: Record<string, any>[] = saasRes.data || [];
  const publishingBooks: Record<string, any>[] = publishingRes.data || [];
  const ledgerEvents: Record<string, any>[] = ledgerRes.data || [];
  const hasLedger = ledgerEvents.length > 0;
  const pipelineContacts = contacts;
  const crmContacts = contacts.filter((contact) => contact.pipeline_status !== "NEW");
  const nonMondeoPipelineContacts = pipelineContacts.filter((contact) => normalizeBrandId(String(contact.brand_id || "")) !== "mondeo");
  const nonMondeoCrmContacts = crmContacts.filter((contact) => normalizeBrandId(String(contact.brand_id || "")) !== "mondeo");

  const brandDataMap: Record<string, BrandData> = {};

  for (const brand of BRANDS) {
    const data = emptyBrandData(brand.id);
    const brandPosts = publications.filter(
      (post) =>
        normalizeBrandId(String(post.brand_id || "")) === brand.id ||
        normalizeBrandId(String(post.brand || "")) === brand.id,
    );
    const brandPublished = brandPosts.filter((post) => post.status === "published");
    const brandAccounts = socialAccounts.filter(
      (account) =>
        normalizeBrandId(String(account.brand || "")) === brand.id ||
        normalizeBrandId(String(account.brand_id || "")) === brand.id,
    );
    const brandPipeline = pipelineContacts.filter(
      (contact) => normalizeBrandId(String(contact.brand_id || "")) === brand.id,
    );
    const brandCrm = crmContacts.filter(
      (contact) => normalizeBrandId(String(contact.brand_id || "")) === brand.id,
    );
    const brandActions = growthActions.filter(
      (action) =>
        normalizeBrandId(String(action.brand || "")) === brand.id ||
        normalizeBrandId(String(action.brand_id || "")) === brand.id,
    );
    const uniqueWon = contacts.filter(
      (contact) =>
        String(contact.pipeline_status || "").toUpperCase() === "WON" &&
        normalizeBrandId(String(contact.brand_id || "")) === brand.id,
    );

    data.commissionTotal = uniqueWon.reduce((sum, contact) => sum + (Number(contact.commission_amount) || 0), 0);
    data.commissionPaid = uniqueWon
      .filter((contact) => contact.commission_paid_date)
      .reduce((sum, contact) => sum + (Number(contact.commission_amount) || 0), 0);
    data.commissionPending = data.commissionTotal - data.commissionPaid;
    data.wonDeals = uniqueWon.length;
    data.customers = brandCrm.length;
    data.totalPosts = brandPosts.length;
    data.publishedPosts = brandPublished.length;
    data.connectedAccounts = brandAccounts.length;
    data.pipelineLeads = brandPipeline.length;
    data.crmContacts = brandCrm.length;
    data.growthActions = brandActions.length;
    data.revenueAmount = uniqueWon.reduce((sum, contact) => sum + (Number(contact.sale_price) || 0), 0);

    const brandLedger = ledgerEvents.filter((event) => event.brand_id === brand.id);
    data.financialIncome = brandLedger
      .filter((event) => event.direction === "income")
      .reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    data.financialExpense = brandLedger
      .filter((event) => event.direction === "expense")
      .reduce((sum, event) => sum + (Number(event.amount) || 0), 0);
    data.financialNet = data.financialIncome - data.financialExpense;

    // Important: commission numbers in Business Overview should mirror CRM
    // won-deals by default. Ledger streams can lag or represent only partial
    // booking/payment events, which makes commission totals look "wrong"
    // compared to Pipeline/CRM.

    if (brand.id === "chatgenius") {
      data.saasApps = saasApps.length;
      data.saasMrr = hasLedger
        ? brandLedger.filter((event) => event.stream === "saas_mrr").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
        : saasApps.reduce((sum, app) => sum + (Number(app.mrr) || 0), 0);
      data.saasRevenue = hasLedger
        ? brandLedger.filter((event) => event.stream === "saas_revenue").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
        : saasApps.reduce((sum, app) => sum + (Number(app.total_revenue) || 0), 0);
      data.revenueAmount += data.saasRevenue;
    }

    if (brand.id === "freddypublishing") {
      data.publishingBooks = publishingBooks.length;
      data.publishingOrders = publishingBooks.reduce((sum, book) => sum + (Number(book.orders) || 0), 0);
      data.publishingRoyalties = hasLedger
        ? brandLedger.filter((event) => event.stream === "kdp_royalty").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
        : publishingBooks.reduce((sum, book) => sum + (Number(book.royalties) || 0), 0);
      data.revenueAmount += data.publishingRoyalties;
    }

    if (brand.id === "donaanna" && oliviaData) {
      const oliviaLedger = brandLedger.filter(
        (event) => event.source_type === "olivia" || String(event.stream || "").startsWith("olive_")
      );
      const hasOliviaLedger = oliviaLedger.length > 0;
      data.oliviaRevenue = hasOliviaLedger
        ? brandLedger
            .filter((event) => event.stream === "olive_harvest" || event.stream === "olive_subsidy")
            .reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
        : Number(oliviaData.financials.totalRevenue || 0) + Number(oliviaData.financials.totalSubsidies || 0);
      data.oliviaNetProfit = hasOliviaLedger ? data.financialNet : Number(oliviaData.financials.netProfit || 0);
      data.revenueAmount += data.oliviaRevenue;
    }

    if (brand.id === "mondeo") {
      // Mondeo is not a lead/CRM/commission business. It is internal property/admin follow-up.
      // Business Overview should show property value plus monthly interest/payment income.
      if (familyMondeoData.totalPaid > data.financialIncome) {
        data.financialIncome = familyMondeoData.totalPaid;
        data.financialNet = data.financialIncome - data.financialExpense;
      }
      data.revenueAmount = Math.max(data.revenueAmount, MONDEO_CONTRACT.purchasePriceNok);
      data.commissionTotal = 0;
      data.commissionPaid = 0;
      data.commissionPending = 0;
      data.pipelineLeads = 0;
      data.crmContacts = 0;
      data.customers = 0;
      data.wonDeals = 1;
    }

    data.revenue = formatRevenue(data.revenueAmount, getBrandRevenueCurrency(brand.id));
    brandDataMap[brand.id] = data;
  }

  const totals = {
    totalPosts: publications.length,
    publishedPosts: publications.filter((post) => post.status === "published").length,
    connectedAccounts: socialAccounts.length,
    totalBrands: BRANDS.length,
    pipelineLeads: nonMondeoPipelineContacts.length,
    crmContacts: nonMondeoCrmContacts.length,
    saasApps: saasApps.length,
    saasMrr: hasLedger
      ? ledgerEvents.filter((event) => event.stream === "saas_mrr").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
      : saasApps.reduce((sum, app) => sum + (Number(app.mrr) || 0), 0),
    saasRevenue: hasLedger
      ? ledgerEvents.filter((event) => event.stream === "saas_revenue").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
      : saasApps.reduce((sum, app) => sum + (Number(app.total_revenue) || 0), 0),
    publishingBooks: publishingBooks.length,
    publishingOrders: publishingBooks.reduce((sum, book) => sum + (Number(book.orders) || 0), 0),
    publishingRoyalties: hasLedger
      ? ledgerEvents.filter((event) => event.stream === "kdp_royalty").reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
      : publishingBooks.reduce((sum, book) => sum + (Number(book.royalties) || 0), 0),
    oliviaRevenue: ledgerEvents.some((event) => event.brand_id === "donaanna" && (event.source_type === "olivia" || String(event.stream || "").startsWith("olive_")))
      ? ledgerEvents
          .filter((event) => event.brand_id === "donaanna" && (event.stream === "olive_harvest" || event.stream === "olive_subsidy"))
          .reduce((sum, event) => sum + (Number(event.amount) || 0), 0)
      : oliviaData
        ? Number(oliviaData.financials.totalRevenue || 0) + Number(oliviaData.financials.totalSubsidies || 0)
        : 0,
    oliviaNetProfit: ledgerEvents.some((event) => event.brand_id === "donaanna" && (event.source_type === "olivia" || String(event.stream || "").startsWith("olive_")))
      ? ledgerEvents
          .filter((event) => event.brand_id === "donaanna")
          .reduce((sum, event) => sum + (event.direction === "expense" ? -Number(event.amount || 0) : event.direction === "income" ? Number(event.amount || 0) : 0), 0)
      : oliviaData
        ? Number(oliviaData.financials.netProfit || 0)
        : 0,
    financeEvents: ledgerEvents.length,
    financialIncome: ledgerEvents.filter((event) => event.direction === "income").reduce((sum, event) => sum + (Number(event.amount) || 0), 0),
    financialExpense: ledgerEvents.filter((event) => event.direction === "expense").reduce((sum, event) => sum + (Number(event.amount) || 0), 0),
    financialNet: ledgerEvents.reduce((sum, event) => sum + (event.direction === "expense" ? -Number(event.amount || 0) : event.direction === "income" ? Number(event.amount || 0) : 0), 0),
  };

  return NextResponse.json({
    brandDataMap,
    totals,
    oliviaData,
    source: "supabase",
    tableWarnings: {
      saas: saasRes.error?.message || null,
      publishing: publishingRes.error?.message || null,
      contacts: contactsRes.error?.message || null,
      finance: ledgerRes.error?.message || null,
      familyMondeo: familyMondeoData.warnings.join("; ") || null,
    },
  });
}
