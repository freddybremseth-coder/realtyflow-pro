import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { getDonaAnnaSupabase } from "@/lib/dona-anna/supabase";
import { loadDonaAnnaSnapshot } from "@/services/dona-anna/commerce-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/olivia
 * Fetches aggregated financial data from Olivia (DonaAnna farm management).
 * Connects to the same or separate Supabase project via OLIVIA_SUPABASE_URL.
 * Falls back to the main Supabase project if no separate URL is configured.
 */
function getOliviaSupabase() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OLIVIA_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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
  const ordered = [configured, "olivia"].filter(Boolean);
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

export async function GET(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;

    const supabase = getOliviaSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Olivia Supabase not configured" }, { status: 503 });
    }

    // Fetch all data in parallel
    const [harvestRes, expenseRes, subsidyRes, parcelRes, settingsRes] = await Promise.allSettled([
      queryOliviaTable(supabase, "harvest_records", "*", { orderBy: "harvest_date", ascending: false }),
      queryOliviaTable(supabase, "farm_expenses", "*", { orderBy: "date", ascending: false }),
      queryOliviaTable(supabase, "subsidy_income", "*", { orderBy: "date", ascending: false }),
      queryOliviaTable(supabase, "parcels", "id, name, area, municipality, crop_type, tree_count"),
      queryOliviaTable(supabase, "farm_settings", "*", { limit: 1, single: true }),
    ]);

    const harvests = harvestRes.status === "fulfilled" ? ((harvestRes.value as any).data || []) : [];
    const expenses = expenseRes.status === "fulfilled" ? ((expenseRes.value as any).data || []) : [];
    const subsidies = subsidyRes.status === "fulfilled" ? ((subsidyRes.value as any).data || []) : [];
    const parcels = parcelRes.status === "fulfilled" ? ((parcelRes.value as any).data || []) : [];
    const settings = settingsRes.status === "fulfilled" ? (settingsRes.value as any).data : null;

    // Calculate aggregated financials
    const totalHarvestRevenue = harvests.reduce(
      (sum: number, h: Record<string, unknown>) =>
        sum + (Number(h.kilograms) || 0) * (Number(h.price_per_kg) || 0),
      0
    );
    const totalHarvestKg = harvests.reduce(
      (sum: number, h: Record<string, unknown>) => sum + (Number(h.kilograms) || 0),
      0
    );
    const totalExpenses = expenses.reduce(
      (sum: number, e: Record<string, unknown>) => sum + (Number(e.amount) || 0),
      0
    );
    const totalSubsidies = subsidies.reduce(
      (sum: number, s: Record<string, unknown>) => sum + (Number(s.amount) || 0),
      0
    );

    // Group expenses by category
    const expensesByCategory: Record<string, number> = {};
    for (const e of expenses) {
      const cat = (e.category as string) || "Annet";
      expensesByCategory[cat] = (expensesByCategory[cat] || 0) + (Number(e.amount) || 0);
    }

    // Group harvests by season
    const harvestsBySeason: Record<string, { kg: number; revenue: number }> = {};
    for (const h of harvests) {
      const season = (h.season as string) || "Ukjent";
      if (!harvestsBySeason[season]) harvestsBySeason[season] = { kg: 0, revenue: 0 };
      harvestsBySeason[season].kg += Number(h.kilograms) || 0;
      harvestsBySeason[season].revenue += (Number(h.kilograms) || 0) * (Number(h.price_per_kg) || 0);
    }

    const netProfit = totalHarvestRevenue + totalSubsidies - totalExpenses;
    const tableErrors = {
      harvest_records: settledError(harvestRes),
      farm_expenses: settledError(expenseRes),
      subsidy_income: settledError(subsidyRes),
      parcels: settledError(parcelRes),
      farm_settings: settledError(settingsRes),
    };
    const warnings = Object.entries(tableErrors)
      .filter(([, message]) => isCriticalOliviaTableError(message))
      .map(([table, message]) => `${table}: ${message}`);
    const canonicalClient = getDonaAnnaSupabase();
    let canonicalCommerce = null;
    if (canonicalClient) {
      try {
        const snapshot = await loadDonaAnnaSnapshot(canonicalClient);
        canonicalCommerce = {
          source: "realtyflow",
          metrics: snapshot.metrics,
          products: snapshot.products,
          priceLists: snapshot.priceLists,
          priceItems: snapshot.priceItems,
          warehouses: snapshot.warehouses,
          lots: snapshot.lots,
          stock: snapshot.stock,
        };
      } catch (error) {
        warnings.push(`Canonical commerce: ${error instanceof Error ? error.message : "unavailable"}`);
      }
    }

    return NextResponse.json({
      source: "supabase",
      supabaseHost: getOliviaHost(),
      schemaCandidates: getOliviaSchemaCandidates(),
      resolvedSchema:
        (harvestRes.status === "fulfilled" && (harvestRes.value as any).schema) ||
        (settingsRes.status === "fulfilled" && (settingsRes.value as any).schema) ||
        null,
      configuredSeparateOliviaDb: Boolean(process.env.OLIVIA_SUPABASE_URL && process.env.OLIVIA_SUPABASE_KEY),
      commerceSystemOfRecord: "realtyflow",
      canonicalCommerce,
      warnings,
      tableErrors,
      farmName: settings?.farm_name || "DonaAnna",
      currency: settings?.currency || "EUR",
      parcels: {
        count: parcels.length,
        totalArea: parcels.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.area) || 0), 0),
        totalTrees: parcels.reduce((s: number, p: Record<string, unknown>) => s + (Number(p.tree_count) || 0), 0),
      },
      financials: {
        totalRevenue: totalHarvestRevenue,
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
    });
  } catch (error) {
    console.error("[Olivia API]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
