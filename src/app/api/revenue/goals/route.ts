import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  buildRevenueGoalScorecard,
  emptyRevenueGoalConfig,
  REVENUE_GOAL_SCOPES,
  revenueGoalStorageKey,
  type RevenueGoalConfig,
  type RevenueGoalScope,
} from "@/lib/revenue/goals";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCOPE_IDS = new Set<RevenueGoalScope>(REVENUE_GOAL_SCOPES);
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

function optionalTableError(message = "") {
  return /schema cache|does not exist|not find the table|relation .* does not exist/i.test(message);
}

function settledRows(result: PromiseSettledResult<any>, table: string, warnings: string[]) {
  if (result.status === "rejected") {
    warnings.push(`${table}: ${result.reason instanceof Error ? result.reason.message : "ukjent feil"}`);
    return [];
  }
  if (result.value?.error) {
    if (!optionalTableError(result.value.error.message || "")) warnings.push(`${table}: ${result.value.error.message}`);
    return [];
  }
  return result.value?.data || [];
}

function validScope(value: unknown): RevenueGoalScope | null {
  const scope = String(value || "all").trim().toLowerCase() as RevenueGoalScope;
  return SCOPE_IDS.has(scope) ? scope : null;
}

function validMonth(value: unknown) {
  const month = String(value || currentMonth()).trim();
  return MONTH_PATTERN.test(month) ? month : null;
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function configFromSettings(row: any, scope: RevenueGoalScope, month: string): RevenueGoalConfig {
  const empty = emptyRevenueGoalConfig(scope, month);
  const settings = row?.settings && typeof row.settings === "object" ? row.settings : {};
  const targets = settings.targets && typeof settings.targets === "object" ? settings.targets : settings;
  return {
    ...empty,
    commissionTargetEur: numberOrNull(targets.commissionTargetEur),
    closedDealsTarget: numberOrNull(targets.closedDealsTarget),
    keyholdingMrrTargetEur: numberOrNull(targets.keyholdingMrrTargetEur),
    keyholdingContractsTarget: numberOrNull(targets.keyholdingContractsTarget),
    recoveredLeadsTarget: numberOrNull(targets.recoveredLeadsTarget),
    notes: String(settings.notes || "").trim() || null,
    updatedAt: row?.updated_at || settings.updatedAt || null,
  };
}

function parseTarget(value: unknown, label: string, max: number, integer = false) {
  if (value === undefined || value === null || value === "" || Number(value) === 0) return { value: null as number | null };
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (integer && !Number.isInteger(number))) {
    return { value: null as number | null, error: `${label} har ugyldig verdi.` };
  }
  return { value: number };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { scorecard: null });
  if (adminError) return adminError;

  const scope = validScope(new URL(request.url).searchParams.get("scope"));
  const month = validMonth(new URL(request.url).searchParams.get("month"));
  if (!scope) return NextResponse.json({ error: "Invalid revenue goal scope", scorecard: null }, { status: 400 });
  if (!month) return NextResponse.json({ error: "Invalid month. Use YYYY-MM.", scorecard: null }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", scorecard: null }, { status: 500 });

  const storageKey = revenueGoalStorageKey(scope, `${month}-01`);
  const results = await Promise.allSettled([
    supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(2000),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", storageKey).maybeSingle(),
    supabase.from("buyer_profiles").select("id,brand,contact_id,status,summary,created_at,updated_at").limit(500),
    supabase.from("lead_property_shortlists").select("id,brand,buyer_profile_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_presentations").select("id,brand,buyer_profile_id,shortlist_id,status,title,created_at,updated_at").limit(500),
    supabase.from("lead_customer_message_drafts").select("id,brand,buyer_profile_id,shortlist_id,presentation_id,status,subject,created_at,updated_at").limit(500),
  ]);

  if (results[0].status === "rejected" || results[0].value?.error) {
    const message = results[0].status === "rejected"
      ? results[0].reason instanceof Error ? results[0].reason.message : "Kunne ikke hente kontakter"
      : results[0].value.error.message;
    return NextResponse.json({ error: message, scorecard: null }, { status: 500 });
  }

  const warnings: string[] = [];
  const contacts = results[0].value?.data || [];
  let goalRow: any = null;
  if (results[1].status === "rejected") warnings.push(`brand_settings: ${results[1].reason instanceof Error ? results[1].reason.message : "ukjent feil"}`);
  else if (results[1].value?.error) warnings.push(`brand_settings: ${results[1].value.error.message}`);
  else goalRow = results[1].value?.data || null;

  const config = configFromSettings(goalRow, scope, month);
  const scorecard = buildRevenueGoalScorecard({
    contacts,
    config,
    profiles: settledRows(results[2], "buyer_profiles", warnings),
    shortlists: settledRows(results[3], "lead_property_shortlists", warnings),
    presentations: settledRows(results[4], "lead_customer_presentations", warnings),
    messageDrafts: settledRows(results[5], "lead_customer_message_drafts", warnings),
    warnings,
  });

  return NextResponse.json({ scorecard, storage: { table: "brand_settings", key: storageKey } });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const scope = validScope(body.scope);
  const month = validMonth(body.month);
  if (!scope) return NextResponse.json({ error: "Invalid revenue goal scope" }, { status: 400 });
  if (!month) return NextResponse.json({ error: "Invalid month. Use YYYY-MM." }, { status: 400 });

  const commission = parseTarget(body.commissionTargetEur, "Provisjonsmålet", 10_000_000);
  const deals = parseTarget(body.closedDealsTarget, "Salgsmålet", 1000, true);
  const mrr = parseTarget(body.keyholdingMrrTargetEur, "Keyholding MRR-målet", 1_000_000);
  const contracts = parseTarget(body.keyholdingContractsTarget, "Keyholding-avtalemålet", 10_000, true);
  const recovered = parseTarget(body.recoveredLeadsTarget, "Recovery-målet", 10_000, true);
  const error = commission.error || deals.error || mrr.error || contracts.error || recovered.error;
  if (error) return NextResponse.json({ error }, { status: 400 });

  const notes = String(body.notes || "").trim();
  if (notes.length > 1000) return NextResponse.json({ error: "Notater kan maksimalt være 1000 tegn." }, { status: 400 });

  const updatedAt = new Date().toISOString();
  const config: RevenueGoalConfig = {
    scope,
    periodStart: `${month}-01`,
    commissionTargetEur: commission.value,
    closedDealsTarget: deals.value,
    keyholdingMrrTargetEur: mrr.value,
    keyholdingContractsTarget: contracts.value,
    recoveredLeadsTarget: recovered.value,
    notes: notes || null,
    updatedAt,
  };
  const storageKey = revenueGoalStorageKey(scope, config.periodStart);
  const settings = {
    kind: "revenue-goals",
    version: 1,
    scope,
    periodStart: config.periodStart,
    targets: {
      commissionTargetEur: config.commissionTargetEur,
      closedDealsTarget: config.closedDealsTarget,
      keyholdingMrrTargetEur: config.keyholdingMrrTargetEur,
      keyholdingContractsTarget: config.keyholdingContractsTarget,
      recoveredLeadsTarget: config.recoveredLeadsTarget,
    },
    notes: config.notes,
    updatedAt,
    automaticActions: false,
  };

  const { error: saveError } = await supabase
    .from("brand_settings")
    .upsert({ brand_id: storageKey, settings, updated_at: updatedAt }, { onConflict: "brand_id" });

  if (saveError) return NextResponse.json({ error: saveError.message }, { status: 500 });
  return NextResponse.json({ ok: true, config, storage: { table: "brand_settings", key: storageKey } });
}
