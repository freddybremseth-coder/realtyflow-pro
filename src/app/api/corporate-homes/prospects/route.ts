import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import {
  CORPORATE_PROSPECT_TARGET,
  normalizeCorporateProspect,
} from "@/lib/corporate-prospects";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function keyFor(row: { domain?: string | null; organization_number?: string | null; company_name?: string | null }) {
  if (row.organization_number) return `org:${String(row.organization_number).trim()}`;
  if (row.domain) return `domain:${String(row.domain).trim().toLowerCase()}`;
  return `name:${String(row.company_name || "").trim().toLowerCase()}`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { prospects: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured", prospects: [] }, { status: 500 });

  const [
    { data: prospects, error },
    { data: contacts, error: contactsError },
    { data: lastRun, error: lastRunError },
    { data: runtimeControl, error: runtimeControlError },
  ] = await Promise.all([
    supabase
      .from("corporate_prospects")
      .select("*")
      .eq("brand_id", "zeneco")
      .order("fit_score", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("corporate_prospect_contacts")
      .select("prospect_id,status,is_primary,confidence")
      .limit(5000),
    supabase
      .from("automation_logs")
      .select("id,action,status,details,created_at")
      .eq("action", "corporate_homes_discovery")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_runtime_controls")
      .select("control_key,label,enabled,risk_level,config,updated_at")
      .eq("control_key", "cron:/api/cron/corporate-homes-discovery")
      .maybeSingle(),
  ]);

  if (error) return NextResponse.json({ error: error.message, prospects: [] }, { status: 500 });

  const all = prospects || [];
  const params = request.nextUrl.searchParams;
  const q = String(params.get("q") || "").trim().toLowerCase();
  const status = String(params.get("status") || "").trim().toUpperCase();
  const tier = String(params.get("tier") || "").trim().toUpperCase();

  const contactMap = new Map<string, { total: number; verified: number; primary: number }>();
  for (const row of contacts || []) {
    const id = String((row as any).prospect_id || "");
    if (!id) continue;
    const current = contactMap.get(id) || { total: 0, verified: 0, primary: 0 };
    current.total += 1;
    if (["VERIFIED", "CONTACT_READY"].includes(String((row as any).status || "").toUpperCase())) current.verified += 1;
    if ((row as any).is_primary) current.primary += 1;
    contactMap.set(id, current);
  }

  const visible = all
    .filter((row: any) => !status || String(row.status || "").toUpperCase() === status)
    .filter((row: any) => !tier || String(row.fit_tier || "").toUpperCase() === tier)
    .filter((row: any) => {
      if (!q) return true;
      return [
        row.company_name,
        row.domain,
        row.organization_number,
        row.industry,
        row.city,
        row.organization_type,
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    })
    .map((row: any) => ({ ...row, contact_coverage: contactMap.get(String(row.id)) || { total: 0, verified: 0, primary: 0 } }));

  const statusCounts = all.reduce<Record<string, number>>((acc: Record<string, number>, row: any) => {
    const value = String(row.status || "DISCOVERED").toUpperCase();
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const tierCounts = all.reduce<Record<string, number>>((acc: Record<string, number>, row: any) => {
    const value = String(row.fit_tier || "UNSCORED").toUpperCase();
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    prospects: visible,
    summary: {
      total: all.length,
      target: CORPORATE_PROSPECT_TARGET,
      progressPercent: Math.min(100, Math.round((all.length / CORPORATE_PROSPECT_TARGET) * 100)),
      aTier: tierCounts.A || 0,
      bTier: tierCounts.B || 0,
      qualified: (statusCounts.QUALIFIED || 0) + (statusCounts.CONTACT_READY || 0),
      engaged: (statusCounts.CONTACTED || 0) + (statusCounts.ENGAGED || 0) + (statusCounts.MEETING || 0) + (statusCounts.OPPORTUNITY || 0),
      statusCounts,
      tierCounts,
    },
    discovery: {
      lastRun: lastRun || null,
      runtimeControl: runtimeControl || null,
    },
    warnings: [contactsError, lastRunError, runtimeControlError].filter(Boolean).map((item: any) => item.message),
    note: "Prospect records are company-level and remain separate from CRM contacts until explicitly promoted. No outreach is executed by this endpoint.",
  });
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request, { prospects: [] });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const rawRows = Array.isArray(body?.rows) ? body.rows : [body];
  if (!rawRows.length) return NextResponse.json({ error: "No prospect rows supplied" }, { status: 400 });
  if (rawRows.length > 250) return NextResponse.json({ error: "Maximum 250 prospects per import" }, { status: 400 });

  const valid: Array<Record<string, unknown>> = [];
  const invalid: Array<{ index: number; error: string }> = [];

  rawRows.forEach((row: unknown, index: number) => {
    try {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("Row must be an object");
      valid.push(normalizeCorporateProspect(row as Record<string, unknown>));
    } catch (error) {
      invalid.push({ index, error: error instanceof Error ? error.message : "Invalid row" });
    }
  });

  const { data: existing, error: existingError } = await supabase
    .from("corporate_prospects")
    .select("id,company_name,domain,organization_number")
    .eq("brand_id", "zeneco")
    .limit(2000);

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  const known = new Set((existing || []).map((row: any) => keyFor(row)));
  const batchSeen = new Set<string>();
  const duplicates: Array<{ company_name: string; key: string }> = [];
  const toInsert = valid.filter((row: any) => {
    const key = keyFor(row);
    if (known.has(key) || batchSeen.has(key)) {
      duplicates.push({ company_name: String(row.company_name || ""), key });
      return false;
    }
    batchSeen.add(key);
    return true;
  }).map((row) => ({ ...row, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));

  if (!toInsert.length) {
    return NextResponse.json({ created: [], createdCount: 0, duplicateCount: duplicates.length, duplicates, invalid });
  }

  const { data, error } = await supabase
    .from("corporate_prospects")
    .insert(toInsert)
    .select("*");

  if (error) return NextResponse.json({ error: error.message, invalid, duplicates }, { status: 500 });

  return NextResponse.json({
    created: data || [],
    createdCount: data?.length || 0,
    duplicateCount: duplicates.length,
    duplicates,
    invalid,
  }, { status: 201 });
}
