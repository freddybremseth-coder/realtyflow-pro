import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FinancialEvent = {
  brand_id: string;
  source_type: "crm" | "kdp" | "saas" | "olivia" | "manual";
  source_id: string;
  stream:
    | "commission"
    | "sale_value"
    | "kdp_royalty"
    | "saas_revenue"
    | "saas_mrr"
    | "olive_harvest"
    | "olive_subsidy"
    | "olive_expense"
    | "manual_adjustment";
  direction: "income" | "expense" | "metric";
  status: "pending" | "recognized" | "paid" | "cancelled";
  amount: number;
  currency: string;
  event_date: string;
  description: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function getOliviaSupabase() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OLIVIA_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key) as any;
}

function eventDate(value?: unknown) {
  if (!value) return new Date().toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function money(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

async function loadOliviaEvents() {
  const supabase = getOliviaSupabase();
  if (!supabase) return { events: [] as FinancialEvent[], warnings: ["Olivia Supabase not configured"] };

  const [harvestRes, expenseRes, subsidyRes] = await Promise.allSettled([
    supabase.from("harvest_records").select("*").order("harvest_date", { ascending: false }),
    supabase.from("farm_expenses").select("*").order("date", { ascending: false }),
    supabase.from("subsidy_income").select("*").order("date", { ascending: false }),
  ]);

  const warnings: string[] = [];
  const harvests = harvestRes.status === "fulfilled" ? harvestRes.value.data || [] : [];
  const expenses = expenseRes.status === "fulfilled" ? expenseRes.value.data || [] : [];
  const subsidies = subsidyRes.status === "fulfilled" ? subsidyRes.value.data || [] : [];
  if (harvestRes.status === "fulfilled" && harvestRes.value.error) warnings.push(`Olivia harvest: ${harvestRes.value.error.message}`);
  if (expenseRes.status === "fulfilled" && expenseRes.value.error) warnings.push(`Olivia expenses: ${expenseRes.value.error.message}`);
  if (subsidyRes.status === "fulfilled" && subsidyRes.value.error) warnings.push(`Olivia subsidies: ${subsidyRes.value.error.message}`);

  const now = new Date().toISOString();
  const events: FinancialEvent[] = [];

  for (const row of harvests) {
    const amount = money(row.total_revenue ?? (Number(row.kilograms || 0) * Number(row.price_per_kg || 0)));
    if (!amount) continue;
    events.push({
      brand_id: "donaanna",
      source_type: "olivia",
      source_id: String(row.id || `${row.harvest_date}-${row.season || "harvest"}`),
      stream: "olive_harvest",
      direction: "income",
      status: "recognized",
      amount,
      currency: String(row.currency || "EUR"),
      event_date: eventDate(row.harvest_date || row.date),
      description: `Olivia harvest${row.season ? ` ${row.season}` : ""}`,
      metadata: row as Record<string, unknown>,
      updated_at: now,
    });
  }

  for (const row of subsidies) {
    const amount = money(row.amount);
    if (!amount) continue;
    events.push({
      brand_id: "donaanna",
      source_type: "olivia",
      source_id: String(row.id || `${row.date}-${row.category || "subsidy"}`),
      stream: "olive_subsidy",
      direction: "income",
      status: "recognized",
      amount,
      currency: String(row.currency || "EUR"),
      event_date: eventDate(row.date),
      description: `Olivia subsidy${row.category ? `: ${row.category}` : ""}`,
      metadata: row as Record<string, unknown>,
      updated_at: now,
    });
  }

  for (const row of expenses) {
    const amount = money(row.amount);
    if (!amount) continue;
    events.push({
      brand_id: "donaanna",
      source_type: "olivia",
      source_id: String(row.id || `${row.date}-${row.category || "expense"}`),
      stream: "olive_expense",
      direction: "expense",
      status: "paid",
      amount,
      currency: String(row.currency || "EUR"),
      event_date: eventDate(row.date),
      description: `Olivia expense${row.category ? `: ${row.category}` : ""}`,
      metadata: row as Record<string, unknown>,
      updated_at: now,
    });
  }

  return { events, warnings };
}

export async function POST() {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const now = new Date().toISOString();
  const warnings: string[] = [];

  const [contactsRes, publishingRes, saasRes, oliviaResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, email, brand_id, pipeline_status, sale_price, commission_amount, commission_paid_date, updated_at")
      .eq("pipeline_status", "WON"),
    supabase.from("publishing_books").select("id, title, brand_id, asin, orders, royalties, currency, updated_at"),
    supabase.from("saas_apps").select("id, slug, name, total_revenue, mrr, arr, currency, updated_at"),
    loadOliviaEvents(),
  ]);

  if (contactsRes.error) warnings.push(`CRM: ${contactsRes.error.message}`);
  if (publishingRes.error) warnings.push(`KDP: ${publishingRes.error.message}`);
  if (saasRes.error) warnings.push(`SaaS: ${saasRes.error.message}`);
  warnings.push(...oliviaResult.warnings);

  const events: FinancialEvent[] = [];

  for (const contact of contactsRes.data || []) {
    const brandId = String(contact.brand_id || "soleada");
    const status = contact.commission_paid_date ? "paid" : "pending";
    const commission = money(contact.commission_amount);
    const saleValue = money(contact.sale_price);

    if (commission) {
      events.push({
        brand_id: brandId,
        source_type: "crm",
        source_id: String(contact.id),
        stream: "commission",
        direction: "income",
        status,
        amount: commission,
        currency: "EUR",
        event_date: eventDate(contact.commission_paid_date || contact.updated_at),
        description: `Commission: ${contact.name || contact.email || "WON contact"}`,
        metadata: { contact_id: contact.id, sale_price: saleValue, pipeline_status: contact.pipeline_status },
        updated_at: now,
      });
    }

    if (saleValue) {
      events.push({
        brand_id: brandId,
        source_type: "crm",
        source_id: String(contact.id),
        stream: "sale_value",
        direction: "metric",
        status: "recognized",
        amount: saleValue,
        currency: "EUR",
        event_date: eventDate(contact.updated_at),
        description: `Sale value: ${contact.name || contact.email || "WON contact"}`,
        metadata: { contact_id: contact.id, commission_amount: commission },
        updated_at: now,
      });
    }
  }

  for (const book of publishingRes.data || []) {
    const royalties = money(book.royalties);
    if (!royalties) continue;
    events.push({
      brand_id: String(book.brand_id || "freddypublishing"),
      source_type: "kdp",
      source_id: String(book.id),
      stream: "kdp_royalty",
      direction: "income",
      status: "recognized",
      amount: royalties,
      currency: String(book.currency || "USD"),
      event_date: eventDate(book.updated_at),
      description: `KDP royalties: ${book.title || book.asin || "Book"}`,
      metadata: { book_id: book.id, asin: book.asin, orders: book.orders },
      updated_at: now,
    });
  }

  for (const app of saasRes.data || []) {
    const revenue = money(app.total_revenue);
    const mrr = money(app.mrr);
    const currency = String(app.currency || "USD");

    if (revenue) {
      events.push({
        brand_id: "chatgenius",
        source_type: "saas",
        source_id: String(app.id),
        stream: "saas_revenue",
        direction: "income",
        status: "recognized",
        amount: revenue,
        currency,
        event_date: eventDate(app.updated_at),
        description: `SaaS revenue: ${app.name || app.slug}`,
        metadata: { app_id: app.id, slug: app.slug, arr: app.arr },
        updated_at: now,
      });
    }

    if (mrr) {
      events.push({
        brand_id: "chatgenius",
        source_type: "saas",
        source_id: String(app.id),
        stream: "saas_mrr",
        direction: "metric",
        status: "recognized",
        amount: mrr,
        currency,
        event_date: eventDate(app.updated_at),
        description: `SaaS MRR: ${app.name || app.slug}`,
        metadata: { app_id: app.id, slug: app.slug, arr: app.arr },
        updated_at: now,
      });
    }
  }

  events.push(...oliviaResult.events);

  if (events.length === 0) {
    return NextResponse.json({ synced: 0, warnings, message: "No financial events found to sync." });
  }

  const { error } = await supabase
    .from("business_financial_events")
    .upsert(events, { onConflict: "source_type,source_id,stream" });

  if (error) return NextResponse.json({ error: error.message, warnings }, { status: 500 });

  const bySource = events.reduce<Record<string, number>>((acc, event) => {
    acc[event.source_type] = (acc[event.source_type] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    synced: events.length,
    bySource,
    warnings,
    message: `${events.length} financial events synced.`,
  });
}
