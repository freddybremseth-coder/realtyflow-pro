import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCareDashboard, type CareDashboardInput } from "@/lib/care/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CareTable =
  | "orgs"
  | "org_members"
  | "kh_plans"
  | "kh_checklist_items"
  | "kh_properties"
  | "kh_contracts"
  | "kh_inspections"
  | "kh_reports"
  | "kh_report_deliveries"
  | "kh_photos"
  | "kh_documents"
  | "kh_invoices"
  | "kh_invoice_lines"
  | "kh_charges"
  | "kh_keys"
  | "kh_key_events"
  | "kh_calendar_events"
  | "kh_issues"
  | "kh_work_orders";

const CARE_TABLES: CareTable[] = [
  "orgs",
  "org_members",
  "kh_plans",
  "kh_checklist_items",
  "kh_properties",
  "kh_contracts",
  "kh_inspections",
  "kh_reports",
  "kh_report_deliveries",
  "kh_photos",
  "kh_documents",
  "kh_invoices",
  "kh_invoice_lines",
  "kh_charges",
  "kh_keys",
  "kh_key_events",
  "kh_calendar_events",
  "kh_issues",
  "kh_work_orders",
];

const ORDER_BY: Partial<Record<CareTable, string>> = {
  kh_properties: "created_at",
  kh_contracts: "created_at",
  kh_inspections: "started_at",
  kh_reports: "created_at",
  kh_report_deliveries: "sent_at",
  kh_photos: "taken_at",
  kh_documents: "created_at",
  kh_invoices: "created_at",
  kh_charges: "created_at",
  kh_keys: "created_at",
  kh_key_events: "at",
  kh_calendar_events: "starts_at",
  kh_issues: "opened_at",
  kh_work_orders: "created_at",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
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

async function queryCareTable(supabase: any, table: CareTable) {
  let query = supabase.schema("care").from(table).select("*");
  const orderBy = ORDER_BY[table];
  if (orderBy) query = query.order(orderBy, { ascending: false });
  query = query.limit(table === "kh_checklist_items" ? 200 : 120);
  const { data, error } = await query;
  return {
    table,
    rows: Array.isArray(data) ? data as Array<Record<string, unknown>> : [],
    error: error ? errorText(error) : null,
  };
}

function rows(results: Awaited<ReturnType<typeof queryCareTable>>[], table: CareTable) {
  return results.find((result) => result.table === table)?.rows || [];
}

async function loadOwnerContacts(supabase: any, properties: Array<Record<string, unknown>>, warnings: string[]) {
  const ownerIds = Array.from(new Set(
    properties
      .map((property) => String(property.owner_id || "").trim())
      .filter(Boolean),
  ));
  if (!ownerIds.length) return [];
  const { data, error } = await supabase
    .from("contacts")
    .select("id,name,email,phone")
    .in("id", ownerIds)
    .limit(500);
  if (error) {
    warnings.push(`contacts: ${error.message}`);
    return [];
  }
  return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { dashboard: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        dashboard: buildCareDashboard({
          warnings: ["Supabase er ikke konfigurert for Care."],
        }),
      },
      { status: 503 },
    );
  }

  const settled = await Promise.allSettled(CARE_TABLES.map((table) => queryCareTable(supabase, table)));
  const results = settled
    .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof queryCareTable>>> => result.status === "fulfilled")
    .map((result) => result.value);
  const warnings = [
    ...settled
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorText(result.reason)),
    ...results
      .filter((result) => result.error)
      .map((result) => `care.${result.table}: ${result.error}`),
  ].filter(Boolean);

  const properties = rows(results, "kh_properties");
  const ownerContacts = await loadOwnerContacts(supabase, properties, warnings);
  const dashboardInput: CareDashboardInput = {
    orgs: rows(results, "orgs"),
    orgMembers: rows(results, "org_members"),
    plans: rows(results, "kh_plans"),
    checklistItems: rows(results, "kh_checklist_items"),
    properties,
    ownerContacts,
    contracts: rows(results, "kh_contracts"),
    inspections: rows(results, "kh_inspections"),
    reports: rows(results, "kh_reports"),
    reportDeliveries: rows(results, "kh_report_deliveries"),
    photos: rows(results, "kh_photos"),
    documents: rows(results, "kh_documents"),
    invoices: rows(results, "kh_invoices"),
    invoiceLines: rows(results, "kh_invoice_lines"),
    charges: rows(results, "kh_charges"),
    keys: rows(results, "kh_keys"),
    keyEvents: rows(results, "kh_key_events"),
    calendarEvents: rows(results, "kh_calendar_events"),
    issues: rows(results, "kh_issues"),
    workOrders: rows(results, "kh_work_orders"),
    warnings,
  };

  return NextResponse.json({ dashboard: buildCareDashboard(dashboardInput) });
}
