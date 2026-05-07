import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/olivia
 * Fetches aggregated financial data from Olivia (DonaAnna farm management).
 * Connects to the same or separate Supabase project via OLIVIA_SUPABASE_URL.
 * Falls back to the main Supabase project if no separate URL is configured.
 */
function getOliviaSupabase() {
  const url = process.env.OLIVIA_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.OLIVIA_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

function settledError(result: PromiseSettledResult<{ error: { message: string } | null }>) {
  if (result.status === "rejected") return result.reason instanceof Error ? result.reason.message : String(result.reason);
  return result.value.error?.message || null;
}

export async function GET() {
  try {
    const supabase = getOliviaSupabase();
    if (!supabase) {
      return NextResponse.json({ error: "Olivia Supabase not configured" }, { status: 503 });
    }

    // Fetch all data in parallel
    const [harvestRes, expenseRes, subsidyRes, parcelRes, settingsRes] = await Promise.allSettled([
      supabase.from("harvest_records").select("*").order("harvest_date", { ascending: false }),
      supabase.from("farm_expenses").select("*").order("date", { ascending: false }),
      supabase.from("subsidy_income").select("*").order("date", { ascending: false }),
      supabase.from("parcels").select("id, name, area, municipality, crop_type, tree_count"),
      supabase.from("farm_settings").select("*").limit(1).single(),
    ]);

    const harvests = harvestRes.status === "fulfilled" ? (harvestRes.value.data || []) : [];
    const expenses = expenseRes.status === "fulfilled" ? (expenseRes.value.data || []) : [];
    const subsidies = subsidyRes.status === "fulfilled" ? (subsidyRes.value.data || []) : [];
    const parcels = parcelRes.status === "fulfilled" ? (parcelRes.value.data || []) : [];
    const settings = settingsRes.status === "fulfilled" ? settingsRes.value.data : null;

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
      .filter(([, message]) => message)
      .map(([table, message]) => `${table}: ${message}`);

    return NextResponse.json({
      source: "supabase",
      supabaseHost: getOliviaHost(),
      configuredSeparateOliviaDb: Boolean(process.env.OLIVIA_SUPABASE_URL && process.env.OLIVIA_SUPABASE_KEY),
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
