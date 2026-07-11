import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  ATTRIBUTION_SCOPES,
  ATTRIBUTION_SOURCE_IDS,
  ATTRIBUTION_SOURCE_LABELS,
  attributionSpendStorageKey,
  buildAttributionWorkspace,
  type AttributionScope,
  type AttributionSourceId,
  type AttributionSpendEntry,
} from "@/lib/revenue/attribution";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SCOPE_SET = new Set<AttributionScope>(ATTRIBUTION_SCOPES);
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

function validScope(value: unknown): AttributionScope | null {
  const scope = String(value || "all").trim().toLowerCase() as AttributionScope;
  return SCOPE_SET.has(scope) ? scope : null;
}

function validMonth(value: unknown) {
  const month = String(value || currentMonth()).trim();
  return MONTH_PATTERN.test(month) ? month : null;
}

function parseSpend(settings: unknown): AttributionSpendEntry[] {
  if (!settings || typeof settings !== "object") return [];
  const record = settings as Record<string, unknown>;
  const rawEntries = Array.isArray(record.spend) ? record.spend : [];
  const entries: AttributionSpendEntry[] = [];
  for (const raw of rawEntries) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const sourceId = String(item.sourceId || "").trim() as AttributionSourceId;
    const spendEur = Number(item.spendEur);
    if (!SOURCE_SET.has(sourceId) || !Number.isFinite(spendEur) || spendEur < 0) continue;
    entries.push({ sourceId, spendEur });
  }
  return entries;
}

function parseSpendBody(value: unknown) {
  if (!Array.isArray(value)) return { entries: [] as AttributionSpendEntry[], error: "spend must be an array" };
  const seen = new Set<AttributionSourceId>();
  const entries: AttributionSpendEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return { entries: [], error: "Each spend entry must be an object" };
    const item = raw as Record<string, unknown>;
    const sourceId = String(item.sourceId || "").trim() as AttributionSourceId;
    const spendEur = Number(item.spendEur);
    if (!SOURCE_SET.has(sourceId) || sourceId === "unknown") return { entries: [], error: `Invalid source: ${sourceId || "missing"}` };
    if (seen.has(sourceId)) return { entries: [], error: `Duplicate source: ${sourceId}` };
    if (!Number.isFinite(spendEur) || spendEur < 0 || spendEur > 10_000_000) return { entries: [], error: `Invalid spend for ${sourceId}` };
    seen.add(sourceId);
    if (spendEur > 0) entries.push({ sourceId, spendEur: Math.round(spendEur * 100) / 100 });
  }
  return { entries, error: null as string | null };
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { workspace: null });
  if (adminError) return adminError;

  const url = new URL(request.url);
  const scope = validScope(url.searchParams.get("scope"));
  const month = validMonth(url.searchParams.get("month"));
  if (!scope) return NextResponse.json({ error: "Invalid attribution scope", workspace: null }, { status: 400 });
  if (!month) return NextResponse.json({ error: "Invalid month. Use YYYY-MM.", workspace: null }, { status: 400 });

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", workspace: null }, { status: 500 });

  const storageKey = attributionSpendStorageKey(scope, `${month}-01`);
  const [contactsResult, settingsResult] = await Promise.allSettled([
    supabase.from("contacts").select("*").order("created_at", { ascending: true }).limit(5000),
    supabase.from("brand_settings").select("settings,updated_at").eq("brand_id", storageKey).maybeSingle(),
  ]);

  if (contactsResult.status === "rejected" || contactsResult.value?.error) {
    const message = contactsResult.status === "rejected"
      ? contactsResult.reason instanceof Error ? contactsResult.reason.message : "Kunne ikke hente kontakter"
      : contactsResult.value?.error?.message || "Kunne ikke hente kontakter";
    return NextResponse.json({ error: message, workspace: null }, { status: 500 });
  }

  const warnings: string[] = [];
  let settings: Record<string, unknown> = {};
  let updatedAt: string | null = null;
  if (settingsResult.status === "rejected") {
    warnings.push(`Kostnadskonfigurasjon kunne ikke hentes: ${settingsResult.reason instanceof Error ? settingsResult.reason.message : "ukjent feil"}`);
  } else if (settingsResult.value?.error) {
    warnings.push(`Kostnadskonfigurasjon kunne ikke hentes: ${settingsResult.value.error.message}`);
  } else {
    settings = settingsResult.value?.data?.settings || {};
    updatedAt = settingsResult.value?.data?.updated_at || null;
  }

  const workspace = buildAttributionWorkspace({
    contacts: contactsResult.value?.data || [],
    scope,
    periodStart: `${month}-01`,
    spend: parseSpend(settings),
    warnings,
  });

  return NextResponse.json({
    workspace,
    config: {
      spend: parseSpend(settings),
      notes: String(settings.notes || ""),
      updatedAt,
      storageKey,
    },
    sourceOptions: ATTRIBUTION_SOURCE_IDS.filter((id) => id !== "unknown").map((id) => ({ id, label: ATTRIBUTION_SOURCE_LABELS[id] })),
  });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const scope = validScope(body.scope);
  const month = validMonth(body.month);
  if (!scope) return NextResponse.json({ error: "Invalid attribution scope" }, { status: 400 });
  if (!month) return NextResponse.json({ error: "Invalid month. Use YYYY-MM." }, { status: 400 });

  const parsed = parseSpendBody(body.spend);
  if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const notes = String(body.notes || "").trim();
  if (notes.length > 1000) return NextResponse.json({ error: "Notater kan maksimalt være 1000 tegn." }, { status: 400 });

  const updatedAt = new Date().toISOString();
  const storageKey = attributionSpendStorageKey(scope, `${month}-01`);
  const settings = {
    kind: "revenue-attribution-spend",
    version: 1,
    scope,
    periodStart: `${month}-01`,
    spend: parsed.entries,
    notes: notes || null,
    updatedAt,
    automaticActions: false,
  };

  const { error } = await supabase
    .from("brand_settings")
    .upsert({ brand_id: storageKey, settings, updated_at: updatedAt }, { onConflict: "brand_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, config: { spend: parsed.entries, notes: notes || "", updatedAt, storageKey } });
}
