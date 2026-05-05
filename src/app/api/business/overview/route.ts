import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { BRANDS } from "@/lib/constants";

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
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getOliviaSupabase() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OLIVIA_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function safeRows<T>(result: PromiseSettledResult<{ data: T[] | null }>) {
  return result.status === "fulfilled" ? result.value.data || [] : [];
}

function formatRevenue(value: number, currency = "EUR") {
  if (!value) return "Ikke tilgjengelig";
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

async function getOliviaData() {
  const supabase = getOliviaSupabase();
  if (!supabase) return null;

  const [harvestRes, expenseRes, subsidyRes, parcelRes, settingsRes] = await Promise.allSettled([
    supabase.from("harvest_records").select("*").order("harvest_date", { ascending: false }),
    supabase.from("farm_expenses").select("*").order("date", { ascending: false }),
    supabase.from("subsidy_income").select("*").order("date", { ascending: false }),
    supabase.from("parcels").select("id, name, area, municipality, crop_type, tree_count"),
    supabase.from("farm_settings").select("*").limit(1).single(),
  ]);

  const harvests = safeRows<Record<string, unknown>>(harvestRes);
  const expenses = safeRows<Record<string, unknown>>(expenseRes);
  const subsidies = safeRows<Record<string, unknown>>(subsidyRes);
  const parcels = safeRows<Record<string, unknown>>(parcelRes);
  const settings = settingsRes.status === "fulfilled" ? settingsRes.value.data : null;

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
  };
}

export async function GET() {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({
      brandDataMap: Object.fromEntries(BRANDS.map((brand) => [brand.id, emptyBrandData(brand.id)])),
      totals: { totalPosts: 0, publishedPosts: 0, connectedAccounts: 0, totalBrands: BRANDS.length, pipelineLeads: 0, crmContacts: 0 },
      oliviaData: null,
      source: "not-configured",
    });
  }

  const [contentRes, accountsRes, contactsRes, actionsRes, saasRes, publishingRes, oliviaData] = await Promise.all([
    supabase.from("content_publications").select("id, brand_id, brand, status, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.from("social_accounts").select("id, brand, brand_id, is_active"),
    supabase.from("contacts").select("id, brand_id, pipeline_status, pipeline_value, sale_price, commission_amount, commission_paid_date"),
    supabase.from("growth_actions").select("id, brand, brand_id, status, created_at, updated_at"),
    supabase.from("saas_apps").select("id, slug, name, status, total_users, active_users_30d, total_revenue, mrr, arr"),
    supabase.from("publishing_books").select("id, brand_id, title, orders, royalties, ad_spend, reviews_count, role, status"),
    getOliviaData(),
  ]);

  const publications = contentRes.data || [];
  const socialAccounts = accountsRes.data || [];
  const contacts = contactsRes.data || [];
  const growthActions = actionsRes.data || [];
  const saasApps = saasRes.data || [];
  const publishingBooks = publishingRes.data || [];
  const pipelineContacts = contacts;
  const crmContacts = contacts.filter((contact) => contact.pipeline_status !== "NEW");

  const brandDataMap: Record<string, BrandData> = {};

  for (const brand of BRANDS) {
    const data = emptyBrandData(brand.id);
    const brandPosts = publications.filter((post) => post.brand_id === brand.id || post.brand === brand.id);
    const brandPublished = brandPosts.filter((post) => post.status === "published");
    const brandAccounts = socialAccounts.filter((account) => account.brand === brand.id || account.brand_id === brand.id);
    const brandPipeline = pipelineContacts.filter((contact) => contact.brand_id === brand.id);
    const brandCrm = crmContacts.filter((contact) => contact.brand_id === brand.id);
    const brandActions = growthActions.filter((action) => action.brand === brand.id || action.brand_id === brand.id);
    const uniqueWon = contacts.filter((contact) => contact.pipeline_status === "WON" && contact.brand_id === brand.id);

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

    if (brand.id === "chatgenius") {
      data.saasApps = saasApps.length;
      data.saasMrr = saasApps.reduce((sum, app) => sum + (Number(app.mrr) || 0), 0);
      data.saasRevenue = saasApps.reduce((sum, app) => sum + (Number(app.total_revenue) || 0), 0);
      data.revenueAmount += data.saasRevenue;
    }

    if (brand.id === "freddypublishing") {
      data.publishingBooks = publishingBooks.length;
      data.publishingOrders = publishingBooks.reduce((sum, book) => sum + (Number(book.orders) || 0), 0);
      data.publishingRoyalties = publishingBooks.reduce((sum, book) => sum + (Number(book.royalties) || 0), 0);
      data.revenueAmount += data.publishingRoyalties;
    }

    if (brand.id === "donaanna" && oliviaData) {
      data.oliviaRevenue = Number(oliviaData.financials.totalRevenue || 0) + Number(oliviaData.financials.totalSubsidies || 0);
      data.oliviaNetProfit = Number(oliviaData.financials.netProfit || 0);
      data.revenueAmount += data.oliviaRevenue;
    }

    data.revenue = formatRevenue(data.revenueAmount, brand.id === "chatgenius" || brand.id === "freddypublishing" ? "USD" : "EUR");
    brandDataMap[brand.id] = data;
  }

  const totals = {
    totalPosts: publications.length,
    publishedPosts: publications.filter((post) => post.status === "published").length,
    connectedAccounts: socialAccounts.length,
    totalBrands: BRANDS.length,
    pipelineLeads: pipelineContacts.length,
    crmContacts: crmContacts.length,
    saasApps: saasApps.length,
    saasMrr: saasApps.reduce((sum, app) => sum + (Number(app.mrr) || 0), 0),
    saasRevenue: saasApps.reduce((sum, app) => sum + (Number(app.total_revenue) || 0), 0),
    publishingBooks: publishingBooks.length,
    publishingOrders: publishingBooks.reduce((sum, book) => sum + (Number(book.orders) || 0), 0),
    publishingRoyalties: publishingBooks.reduce((sum, book) => sum + (Number(book.royalties) || 0), 0),
    oliviaRevenue: oliviaData ? Number(oliviaData.financials.totalRevenue || 0) + Number(oliviaData.financials.totalSubsidies || 0) : 0,
    oliviaNetProfit: oliviaData ? Number(oliviaData.financials.netProfit || 0) : 0,
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
    },
  });
}
