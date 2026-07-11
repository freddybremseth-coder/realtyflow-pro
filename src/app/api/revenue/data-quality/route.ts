import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { extractAttribution } from "@/lib/revenue/attribution";
import {
  buildProductionReadiness,
  buildRevenueDataHealth,
  canonicalPipelineStatus,
  REVENUE_DATA_BRANDS,
  type ProductionProbe,
  type QualityAction,
  type RevenueDataBrand,
} from "@/lib/revenue/data-quality";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ACTIONS = new Set<QualityAction>([
  "NORMALIZE_STATUS",
  "APPLY_DETECTED_SOURCE",
  "SET_BRAND",
  "SCHEDULE_FOLLOWUP",
  "MARK_DUPLICATE_REVIEWED",
]);
const BRAND_IDS = new Set<RevenueDataBrand>(REVENUE_DATA_BRANDS);
const OPTIONAL_TABLE_PATTERN = /schema cache|does not exist|not find the table|relation .* does not exist|could not find/i;
const AUDIT_ACTIONS: Record<QualityAction, string> = {
  NORMALIZE_STATUS: "data_quality_status_normalized",
  APPLY_DETECTED_SOURCE: "data_quality_source_applied",
  SET_BRAND: "data_quality_brand_set",
  SCHEDULE_FOLLOWUP: "data_quality_followup_scheduled",
  MARK_DUPLICATE_REVIEWED: "data_quality_duplicate_reviewed",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function errorText(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const row = error as Record<string, unknown>;
    return [row.code, row.message, row.details, row.hint].filter(Boolean).map(String).join(" ");
  }
  return String(error);
}

function missingColumn(message = "") {
  const match = message.match(/'([^']+)' column|column "([^"]+)"|Could not find the '([^']+)' column/i);
  return match?.[1] || match?.[2] || match?.[3] || "";
}

async function probeTable(
  supabase: any,
  id: string,
  label: string,
  table: string,
  required: boolean,
  keyColumn = "id",
): Promise<ProductionProbe> {
  if (!supabase) return { id, label, required, ok: false, detail: "Supabase er ikke konfigurert." };
  const started = Date.now();
  try {
    const { count, error } = await supabase.from(table).select(keyColumn, { count: "exact", head: true });
    if (error) {
      const message = errorText(error);
      return {
        id,
        label,
        required,
        ok: false,
        count: null,
        latencyMs: Date.now() - started,
        detail: OPTIONAL_TABLE_PATTERN.test(message) ? `${table} mangler i schema.` : message,
      };
    }
    return { id, label, required, ok: true, count: count ?? 0, latencyMs: Date.now() - started, detail: `${table} svarte korrekt.` };
  } catch (error) {
    return { id, label, required, ok: false, count: null, latencyMs: Date.now() - started, detail: errorText(error) };
  }
}

function readinessFrom(probes: ProductionProbe[]) {
  return buildProductionReadiness({
    environment: {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL),
      serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      sessionSecret: Boolean(process.env.REALTYFLOW_SESSION_SECRET),
      adminEmails: Boolean(process.env.REALTYFLOW_ADMIN_EMAILS),
      vercelEnv: process.env.VERCEL_ENV || process.env.NODE_ENV || null,
      deploymentUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
    },
    probes,
  });
}

async function loadReport() {
  const supabase = getSupabase();
  const probesPromise = Promise.all([
    probeTable(supabase, "contacts", "CRM contacts", "contacts", true),
    probeTable(supabase, "brand-settings", "Revenue settings", "brand_settings", true, "brand_id"),
    probeTable(supabase, "work-items", "Work items", "work_items", false),
    probeTable(supabase, "buyer-profiles", "Buyer profiles", "buyer_profiles", false),
    probeTable(supabase, "shortlists", "Lead shortlists", "lead_property_shortlists", false),
    probeTable(supabase, "presentations", "Customer presentations", "lead_customer_presentations", false),
    probeTable(supabase, "message-drafts", "Customer message drafts", "lead_customer_message_drafts", false),
  ]);
  let contacts: any[] = [];
  let contactError = "";
  if (supabase) {
    const result = await supabase.from("contacts").select("*").order("updated_at", { ascending: false }).limit(3000);
    contacts = result.data || [];
    contactError = errorText(result.error);
  } else {
    contactError = "Supabase er ikke konfigurert.";
  }
  const probes = await probesPromise;
  if (contactError) {
    const contactProbe = probes.find((probe) => probe.id === "contacts");
    if (contactProbe) {
      contactProbe.ok = false;
      contactProbe.detail = contactError;
      contactProbe.count = null;
    }
  }
  const readiness = readinessFrom(probes);
  return buildRevenueDataHealth({ contacts, readiness });
}

function auditInteraction(action: QualityAction, content: string, metadata: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const auditAction = AUDIT_ACTIONS[action];
  return {
    id: `data-quality-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "note",
    action: auditAction,
    content,
    date: now,
    direction: "internal",
    metadata: {
      action: auditAction,
      source: "revenue-data-health",
      no_customer_contact: true,
      ...metadata,
    },
  };
}

async function updateWithFallbacks(supabase: any, id: string, payload: Record<string, unknown>) {
  let next = { ...payload };
  const removed: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { data, error } = await supabase.from("contacts").update(next).eq("id", id).select("*").single();
    if (!error) return { data, error: null, removed };
    const column = missingColumn(error.message || "");
    if (!column || !(column in next)) return { data: null, error, removed };
    delete next[column];
    removed.push(column);
  }
  return { data: null, error: { message: "Kunne ikke oppdatere kontakt etter schema-fallbacks." }, removed };
}

async function readContact(supabase: any, id: string) {
  const { data, error } = await supabase.from("contacts").select("*").eq("id", id).single();
  return { data, error };
}

async function updateOne(supabase: any, contact: any, action: QualityAction, updates: Record<string, unknown>, content: string, metadata: Record<string, unknown> = {}) {
  const interactions = Array.isArray(contact.interactions) ? contact.interactions : [];
  return updateWithFallbacks(supabase, contact.id, {
    ...updates,
    interactions: [auditInteraction(action, content, metadata), ...interactions],
    updated_at: new Date().toISOString(),
  });
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { report: null });
  if (adminError) return adminError;
  const report = await loadReport();
  return NextResponse.json({ report });
}

export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const action = clean(body.action, 80).toUpperCase() as QualityAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unsupported data quality action" }, { status: 400 });

  if (action === "MARK_DUPLICATE_REVIEWED") {
    const contactIds = [...new Set((Array.isArray(body.contactIds) ? body.contactIds : []).map((id: unknown) => clean(id, 120)).filter(Boolean))].sort();
    if (contactIds.length < 2 || contactIds.length > 10) return NextResponse.json({ error: "Duplicate review requires 2–10 contact IDs" }, { status: 400 });
    const groupKey = contactIds.join("|");
    const results = [];
    for (const id of contactIds) {
      const { data: contact, error } = await readContact(supabase, id);
      if (error || !contact) return NextResponse.json({ error: errorText(error) || `Contact ${id} not found` }, { status: 404 });
      const result = await updateOne(
        supabase,
        contact,
        action,
        {},
        "Mulig duplikatgruppe er manuelt gjennomgått. Ingen kontakter ble slått sammen eller slettet.",
        { group_key: groupKey, contact_ids: contactIds },
      );
      if (result.error) return NextResponse.json({ error: errorText(result.error), removedColumns: result.removed }, { status: 500 });
      results.push(result.data);
    }
    return NextResponse.json({ ok: true, action, contacts: results, noCustomerContact: true });
  }

  const contactId = clean(body.contactId, 120);
  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });
  const { data: contact, error: readError } = await readContact(supabase, contactId);
  if (readError || !contact) return NextResponse.json({ error: errorText(readError) || "Contact not found" }, { status: 404 });

  let updates: Record<string, unknown> = {};
  let content = "";
  let metadata: Record<string, unknown> = {};

  if (action === "NORMALIZE_STATUS") {
    const current = contact.pipeline_status || contact.status || contact.stage;
    const canonical = canonicalPipelineStatus(current);
    updates = { pipeline_status: canonical };
    content = `Pipeline-status ble manuelt normalisert fra ${clean(current) || "tom"} til ${canonical}.`;
    metadata = { previous_value: clean(current) || null, new_value: canonical };
  }

  if (action === "APPLY_DETECTED_SOURCE") {
    const attribution = extractAttribution(contact);
    if (attribution.sourceId === "unknown" || !attribution.rawSource) {
      return NextResponse.json({ error: "No documented source evidence is available" }, { status: 409 });
    }
    updates = { source: attribution.rawSource };
    content = `Dokumentert lead-kilde ble manuelt strukturert som ${attribution.rawSource}.`;
    metadata = { source_id: attribution.sourceId, evidence: attribution.evidence, confidence: attribution.confidence, new_value: attribution.rawSource };
  }

  if (action === "SET_BRAND") {
    const brandId = clean(body.brandId, 80).toLowerCase() as RevenueDataBrand;
    if (!BRAND_IDS.has(brandId)) return NextResponse.json({ error: "Invalid revenue brand" }, { status: 400 });
    updates = { brand_id: brandId, brand: brandId };
    content = `Kontaktens revenue-brand ble manuelt satt til ${brandId}.`;
    metadata = { previous_value: contact.brand_id || contact.brand || null, new_value: brandId };
  }

  if (action === "SCHEDULE_FOLLOWUP") {
    const date = new Date(clean(body.date, 80));
    const now = new Date();
    const max = new Date(now.getTime() + 2 * 365 * 86_400_000);
    if (Number.isNaN(date.getTime()) || date.getTime() < now.getTime() - 60_000 || date.getTime() > max.getTime()) {
      return NextResponse.json({ error: "Follow-up date must be valid, current or future, and within two years" }, { status: 400 });
    }
    updates = { next_followup: date.toISOString() };
    content = `Intern oppfølging ble manuelt planlagt til ${date.toISOString().slice(0, 10)}. Ingen kundemelding ble sendt.`;
    metadata = { new_value: date.toISOString() };
  }

  const result = await updateOne(supabase, contact, action, updates, content, metadata);
  if (result.error) return NextResponse.json({ error: errorText(result.error), removedColumns: result.removed }, { status: 500 });
  return NextResponse.json({ ok: true, action, contact: result.data, removedColumns: result.removed, noCustomerContact: true });
}
