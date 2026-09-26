import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

const ACTIVE = new Set(["NEW", "CONTACT", "QUALIFIED", "MATCHING", "VIEWING", "NEGOTIATION", "RESERVED", "ON_HOLD"]);

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { corporateHomes: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured", corporateHomes: null }, { status: 500 });
  }

  const [
    { data: contacts, error: contactsError },
    { data: workItems, error: workItemsError },
    { data: prospects, error: prospectsError },
    { data: lastDiscovery, error: lastDiscoveryError },
    { data: discoveryControl, error: discoveryControlError },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id,name,email,phone,source,pipeline_status,pipeline_value,property_interest,next_followup,last_contact,updated_at,created_at,interactions,notes,brand_id")
      .eq("brand_id", "zeneco")
      .ilike("source", "%corporate%")
      .order("updated_at", { ascending: false })
      .limit(1000),
    supabase
      .from("work_items")
      .select("id,title,description,status,priority,source_id,next_action,metadata,created_at,updated_at")
      .eq("brand_id", "zeneco")
      .order("updated_at", { ascending: false })
      .limit(1500),
    supabase
      .from("corporate_prospects")
      .select("id,status,fit_tier,fit_score,converted_contact_id,created_at,updated_at")
      .eq("brand_id", "zeneco")
      .limit(1000),
    supabase
      .from("automation_logs")
      .select("id,status,details,created_at")
      .eq("action", "corporate_homes_discovery")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nexus_runtime_controls")
      .select("enabled,risk_level,config,updated_at")
      .eq("control_key", "cron:/api/cron/corporate-homes-discovery")
      .maybeSingle(),
  ]);

  if (contactsError) {
    return NextResponse.json({ error: contactsError.message, corporateHomes: null }, { status: 500 });
  }

  const rows = contacts || [];
  const prospectRows = prospects || [];
  const ids = new Set(rows.map((row: any) => String(row.id)));
  const corporateWorkItems = (workItems || []).filter((item: any) => {
    if (ids.has(String(item.source_id || ""))) return true;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    return metadata.segment === "corporate_homes" || metadata.request_type === "corporate-home";
  });

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const stages = rows.reduce<Record<string, number>>((acc, row: any) => {
    const stage = String(row.pipeline_status || "NEW").toUpperCase();
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const activeRows = rows.filter((row: any) => ACTIVE.has(String(row.pipeline_status || "NEW").toUpperCase()));
  const pipelineValue = activeRows.reduce((sum: number, row: any) => sum + Number(row.pipeline_value || 0), 0);
  const new30d = rows.filter((row: any) => {
    const value = Date.parse(String(row.created_at || row.updated_at || ""));
    return Number.isFinite(value) && value >= thirtyDaysAgo;
  }).length;
  const dueNow = activeRows.filter((row: any) => {
    const value = Date.parse(String(row.next_followup || ""));
    return Number.isFinite(value) && value <= now;
  }).length;

  const prospectTierCounts = prospectRows.reduce<Record<string, number>>((acc, row: any) => {
    const tier = String(row.fit_tier || "UNSCORED").toUpperCase();
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});
  const prospectStatusCounts = prospectRows.reduce<Record<string, number>>((acc, row: any) => {
    const status = String(row.status || "DISCOVERED").toUpperCase();
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const promotedProspects = prospectRows.filter((row: any) => Boolean(row.converted_contact_id)).length;

  return NextResponse.json({
    corporateHomes: {
      generatedAt: new Date().toISOString(),
      summary: {
        totalLeads: rows.length,
        activeLeads: activeRows.length,
        new30d,
        dueNow,
        openWorkItems: corporateWorkItems.filter((item: any) => !["DONE", "CANCELLED"].includes(String(item.status || "").toUpperCase())).length,
        pipelineValue,
      },
      prospects: {
        total: prospectRows.length,
        target: 250,
        progressPercent: Math.min(100, Math.round((prospectRows.length / 250) * 100)),
        aTier: prospectTierCounts.A || 0,
        bTier: prospectTierCounts.B || 0,
        qualified: (prospectStatusCounts.QUALIFIED || 0) + (prospectStatusCounts.CONTACT_READY || 0),
        promoted: promotedProspects,
        statusCounts: prospectStatusCounts,
        tierCounts: prospectTierCounts,
        discovery: {
          enabled: discoveryControl?.enabled ?? null,
          riskLevel: discoveryControl?.risk_level || null,
          config: discoveryControl?.config || null,
          lastRun: lastDiscovery || null,
        },
      },
      stages,
      contacts: rows.slice(0, 100).map((row: any) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        stage: String(row.pipeline_status || "NEW").toUpperCase(),
        pipelineValue: Number(row.pipeline_value || 0),
        propertyInterest: row.property_interest,
        nextFollowup: row.next_followup,
        lastContact: row.last_contact,
        updatedAt: row.updated_at,
        source: row.source,
      })),
      workItems: corporateWorkItems.slice(0, 100),
    },
    warnings: [workItemsError, prospectsError, lastDiscoveryError, discoveryControlError].filter(Boolean).map((item: any) => item.message),
  });
}
