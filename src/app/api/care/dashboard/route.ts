import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { buildCareDashboard, type CareDashboardInput } from "@/lib/care/dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CareSnapshot = {
  orgs?: Array<Record<string, unknown>>;
  org_members?: Array<Record<string, unknown>>;
  kh_plans?: Array<Record<string, unknown>>;
  kh_checklist_items?: Array<Record<string, unknown>>;
  kh_properties?: Array<Record<string, unknown>>;
  kh_contracts?: Array<Record<string, unknown>>;
  kh_quotes?: Array<Record<string, unknown>>;
  kh_inspections?: Array<Record<string, unknown>>;
  kh_reports?: Array<Record<string, unknown>>;
  kh_report_deliveries?: Array<Record<string, unknown>>;
  kh_photos?: Array<Record<string, unknown>>;
  kh_documents?: Array<Record<string, unknown>>;
  kh_invoices?: Array<Record<string, unknown>>;
  kh_invoice_lines?: Array<Record<string, unknown>>;
  kh_charges?: Array<Record<string, unknown>>;
  kh_keys?: Array<Record<string, unknown>>;
  kh_key_events?: Array<Record<string, unknown>>;
  kh_calendar_events?: Array<Record<string, unknown>>;
  kh_issues?: Array<Record<string, unknown>>;
  kh_work_orders?: Array<Record<string, unknown>>;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function rows(snapshot: CareSnapshot, key: keyof CareSnapshot) {
  const value = snapshot[key];
  return Array.isArray(value) ? value : [];
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function loadCareLeadContext(supabase: any, warnings: string[]) {
  const { data: rawWorkItems, error: workItemsError } = await supabase
    .from("work_items")
    .select("id,title,status,priority,source_id,next_action,metadata,created_at,updated_at")
    .eq("brand_id", "zeneco")
    .eq("source_type", "website_lead")
    .order("created_at", { ascending: false })
    .limit(500);

  if (workItemsError) {
    warnings.push(`Care leads: ${workItemsError.message}`);
    return { workItems: [], contacts: [] };
  }

  const workItems = (Array.isArray(rawWorkItems) ? rawWorkItems : [])
    .filter((row: Record<string, unknown>) => {
      const metadata = record(row.metadata);
      const segment = String(metadata.segment || "").toLowerCase();
      const requestType = String(metadata.request_type || "").toLowerCase();
      const nextAction = String(row.next_action || "").toLowerCase();
      return segment === "care"
        || requestType.startsWith("care-")
        || nextAction.includes("zen eco homes care");
    })
    .slice(0, 100);

  const contactIds = Array.from(new Set(
    workItems
      .map((row: Record<string, unknown>) => String(row.source_id || "").trim())
      .filter(Boolean),
  ));

  if (!contactIds.length) return { workItems, contacts: [] };

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id,name,email,phone,pipeline_status,source,brand_id,created_at,updated_at")
    .in("id", contactIds)
    .limit(200);

  if (contactsError) {
    warnings.push(`Care lead contacts: ${contactsError.message}`);
    return { workItems, contacts: [] };
  }

  return {
    workItems,
    contacts: Array.isArray(contacts) ? contacts as Array<Record<string, unknown>> : [],
  };
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

  const { data, error } = await supabase.rpc("care_dashboard_snapshot");
  if (error) {
    return NextResponse.json(
      {
        dashboard: buildCareDashboard({
          warnings: [`Care snapshot: ${error.code ? `${error.code} ` : ""}${error.message}`],
        }),
      },
      { status: 503 },
    );
  }

  const snapshot = data && typeof data === "object" && !Array.isArray(data)
    ? data as CareSnapshot
    : {};
  const warnings: string[] = [];
  const properties = rows(snapshot, "kh_properties");
  const [ownerContacts, careLeadContext] = await Promise.all([
    loadOwnerContacts(supabase, properties, warnings),
    loadCareLeadContext(supabase, warnings),
  ]);

  const dashboardInput: CareDashboardInput = {
    orgs: rows(snapshot, "orgs"),
    orgMembers: rows(snapshot, "org_members"),
    plans: rows(snapshot, "kh_plans"),
    checklistItems: rows(snapshot, "kh_checklist_items"),
    properties,
    ownerContacts,
    contracts: rows(snapshot, "kh_contracts"),
    quotes: rows(snapshot, "kh_quotes"),
    inspections: rows(snapshot, "kh_inspections"),
    reports: rows(snapshot, "kh_reports"),
    reportDeliveries: rows(snapshot, "kh_report_deliveries"),
    photos: rows(snapshot, "kh_photos"),
    documents: rows(snapshot, "kh_documents"),
    invoices: rows(snapshot, "kh_invoices"),
    invoiceLines: rows(snapshot, "kh_invoice_lines"),
    charges: rows(snapshot, "kh_charges"),
    keys: rows(snapshot, "kh_keys"),
    keyEvents: rows(snapshot, "kh_key_events"),
    calendarEvents: rows(snapshot, "kh_calendar_events"),
    issues: rows(snapshot, "kh_issues"),
    workOrders: rows(snapshot, "kh_work_orders"),
    careLeadWorkItems: careLeadContext.workItems,
    careLeadContacts: careLeadContext.contacts,
    warnings,
  };

  return NextResponse.json({ dashboard: buildCareDashboard(dashboardInput) });
}
