import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  ATTRIBUTION_SOURCE_IDS,
  attributionSpendStorageKey,
  type AttributionSourceId,
  type AttributionSpendEntry,
} from "@/lib/revenue/attribution";
import {
  emptyRevenueGoalConfig,
  revenueGoalStorageKey,
  type RevenueGoalScope,
} from "@/lib/revenue/goals";
import {
  buildMonthlyCloseReport,
  MONTHLY_CLOSE_SCOPES,
  type MonthlyCloseGoalConfig,
  type MonthlyCloseScope,
} from "@/lib/revenue/monthly-close";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCOPE_SET = new Set<MonthlyCloseScope>(MONTHLY_CLOSE_SCOPES);
const SOURCE_SET = new Set<AttributionSourceId>(ATTRIBUTION_SOURCE_IDS);
const MONTH_PATTERN = /^(20(?:2[4-9]|3\d|40))-(0[1-9]|1[0-2])$/;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function validScope(value: unknown): MonthlyCloseScope | null {
  const scope = String(value || "all").trim().toLowerCase() as MonthlyCloseScope;
  return SCOPE_SET.has(scope) ? scope : null;
}

function validMonth(value: unknown) {
  const month = String(value || currentMonth()).trim();
  return MONTH_PATTERN.test(month) ? month : null;
}

function positiveOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseSpend(settings: unknown): AttributionSpendEntry[] {
  if (!settings || typeof settings !== "object") return [];
  const record = settings as Record<string, unknown>;
  const rawEntries = Array.isArray(record.spend) ? record.spend : [];
  const result: AttributionSpendEntry[] = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const sourceId = String(item.sourceId || "").trim() as AttributionSourceId;
    const spendEur = Number(item.spendEur);
    if (!SOURCE_SET.has(sourceId) || !Number.isFinite(spendEur) || spendEur < 0) continue;
    result.push({ sourceId, spendEur });
  }
  return result;
}

function parseGoals(settings: unknown, scope: MonthlyCloseScope, month: string): MonthlyCloseGoalConfig {
  const fallback = emptyRevenueGoalConfig(scope as RevenueGoalScope, month);
  if (!settings || typeof settings !== "object") return fallback;
  const record = settings as Record<string, unknown>;
  const targets = record.targets && typeof record.targets === "object"
    ? record.targets as Record<string, unknown>
    : record;
  return {
    commissionTargetEur: positiveOrNull(targets.commissionTargetEur),
    closedDealsTarget: positiveOrNull(targets.closedDealsTarget),
    keyholdingMrrTargetEur: positiveOrNull(targets.keyholdingMrrTargetEur),
    keyholdingContractsTarget: positiveOrNull(targets.keyholdingContractsTarget),
    recoveredLeadsTarget: positiveOrNull(targets.recoveredLeadsTarget),
    notes: String(record.notes || "").trim() || null,
    updatedAt: String(record.updatedAt || "").trim() || null,
  };
}

function settingsFrom(result: PromiseSettledResult<any>, label: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${label}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return {};
  }
  if (result.value?.error) {
    warnings.push(`${label}: ${result.value.error.message}`);
    return {};
  }
  return result.value?.data?.settings || {};
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { report: null });
  if (adminError) return adminError;

  const url = new URL(request.url);
  const scope = validScope(url.searchParams.get("scope"));
  const month = validMonth(url.searchParams.get("month"));
  if (!scope) return NextResponse.json({ error: "Invalid monthly close scope", report: null }, { status: 400 });
  if (!month) return NextResponse.json({ error: "Invalid month. Use YYYY-MM.", report: null }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", report: null }, { status: 500 });

  const goalKey = revenueGoalStorageKey(scope as RevenueGoalScope, `${month}-01`);
  const spendKey = attributionSpendStorageKey(scope, `${month}-01`);
  const results = await Promise.allSettled([
    supabase.from("contacts").select("*").order("created_at", { ascending: true }).limit(5000),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", goalKey).maybeSingle(),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", spendKey).maybeSingle(),
  ]);

  if (results[0].status === "rejected" || results[0].value?.error) {
    const message = results[0].status === "rejected"
      ? results[0].reason instanceof Error ? results[0].reason.message : "Kunne ikke hente kontakter"
      : results[0].value?.error?.message || "Kunne ikke hente kontakter";
    return NextResponse.json({ error: message, report: null }, { status: 500 });
  }

  const warnings: string[] = [];
  const goalSettings = settingsFrom(results[1], "Målkonfigurasjon kunne ikke hentes", warnings);
  const spendSettings = settingsFrom(results[2], "Kostnadskonfigurasjon kunne ikke hentes", warnings);
  const goals = parseGoals(goalSettings, scope, month);
  const spend = parseSpend(spendSettings);
  const report = buildMonthlyCloseReport({
    contacts: results[0].value?.data || [],
    scope,
    periodStart: `${month}-01`,
    goals,
    spend,
    warnings,
  });

  return NextResponse.json({
    report,
    config: {
      goalKey,
      spendKey,
      goals,
      spend,
      goalsUpdatedAt: results[1].status === "fulfilled" ? results[1].value?.data?.updated_at || null : null,
      spendUpdatedAt: results[2].status === "fulfilled" ? results[2].value?.data?.updated_at || null : null,
    },
  });
}
