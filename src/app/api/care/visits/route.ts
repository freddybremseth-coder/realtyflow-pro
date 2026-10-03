import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getRequestAccessContext, requireAdminApi } from "@/lib/api-admin";
import { isUuid } from "@/lib/care/visit-workflow";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function safeDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function resolveInspectorUserId(request: NextRequest, supabase: any) {
  const context = await getRequestAccessContext(request);
  if (!context?.email) return null;
  const normalized = context.email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Supabase Auth: ${error.message}`);
  return (data?.users || []).find((user: any) => String(user.email || "").trim().toLowerCase() === normalized)?.id || null;
}

async function careData(supabase: any) {
  const care = supabase.schema("care");
  const [propertiesResult, contractsResult, eventsResult, inspectionsResult] = await Promise.all([
    care.from("kh_properties").select("id,org_id,owner_id,reference,property_type,name,address_line,municipality,postcode,has_pool,has_garden,status").eq("status", "active").order("created_at", { ascending: false }).limit(200),
    care.from("kh_contracts").select("id,org_id,property_id,plan_id,plan_snapshot,starts_on,ends_on,status").in("status", ["active", "renewal_due"]).limit(300),
    care.from("kh_calendar_events").select("id,org_id,property_id,event_type,title,starts_at,ends_at,is_billable,status,source,inspection_id,notes").eq("event_type", "inspection").order("starts_at", { ascending: true }).limit(300),
    care.from("kh_inspections").select("id,org_id,property_id,contract_id,template_id,kind,is_billable,status,started_at,completed_at,photo_count,created_at").order("started_at", { ascending: false }).limit(200),
  ]);
  for (const result of [propertiesResult, contractsResult, eventsResult, inspectionsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const properties = propertiesResult.data || [];
  const contracts = contractsResult.data || [];
  const contractsByProperty = new Map(contracts.map((row: any) => [String(row.property_id), row]));
  const propertyById = new Map(properties.map((row: any) => [String(row.id), row]));
  const inspectionsById = new Map((inspectionsResult.data || []).map((row: any) => [String(row.id), row]));

  return {
    properties: properties.map((property: any) => {
      const contract = contractsByProperty.get(String(property.id));
      const plan = record(contract?.plan_snapshot);
      return {
        ...property,
        contract_id: contract?.id || null,
        contract_status: contract?.status || null,
        plan_name: plan.name || null,
        visits_per_month: Number(plan.visits_per_month || 0),
      };
    }),
    events: (eventsResult.data || []).map((event: any) => ({
      ...event,
      property: propertyById.get(String(event.property_id)) || null,
      inspection: event.inspection_id ? inspectionsById.get(String(event.inspection_id)) || null : null,
    })),
    inspections: inspectionsResult.data || [],
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  try {
    return NextResponse.json(await careData(supabase));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Kunne ikke hente Care-besøk." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "").trim().toLowerCase();
  const care = supabase.schema("care");

  try {
    if (action === "schedule") {
      const propertyId = String(body.propertyId || "");
      const startsAt = safeDate(body.startsAt);
      if (!isUuid(propertyId) || !startsAt) return NextResponse.json({ error: "Eiendom og gyldig tidspunkt kreves." }, { status: 400 });

      const { data: property, error: propertyError } = await care
        .from("kh_properties")
        .select("id,org_id,name,reference,status")
        .eq("id", propertyId)
        .eq("status", "active")
        .maybeSingle();
      if (propertyError) throw propertyError;
      if (!property) return NextResponse.json({ error: "Care-eiendommen ble ikke funnet." }, { status: 404 });

      const { data: contract, error: contractError } = await care
        .from("kh_contracts")
        .select("id,status")
        .eq("property_id", propertyId)
        .in("status", ["active", "renewal_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contractError) throw contractError;
      if (!contract) return NextResponse.json({ error: "Aktiv Care-avtale kreves før et løpende besøk kan planlegges." }, { status: 409 });

      const { data: duplicate } = await care
        .from("kh_calendar_events")
        .select("id,starts_at")
        .eq("property_id", propertyId)
        .eq("event_type", "inspection")
        .eq("status", "planned")
        .gte("starts_at", new Date().toISOString())
        .limit(1)
        .maybeSingle();
      if (duplicate) return NextResponse.json({ success: true, event: duplicate, reused: true });

      const end = new Date(startsAt.getTime() + 60 * 60 * 1000);
      const { data: event, error } = await care.from("kh_calendar_events").insert({
        id: randomUUID(),
        org_id: property.org_id,
        property_id: property.id,
        event_type: "inspection",
        title: "Planlagt Care-besøk",
        starts_at: startsAt.toISOString(),
        ends_at: end.toISOString(),
        is_billable: true,
        status: "planned",
        source: "manual",
        notes: { reason: "care_visit_workspace" },
      }).select("*").single();
      if (error) throw error;
      return NextResponse.json({ success: true, event }, { status: 201 });
    }

    if (action === "start") {
      const eventId = String(body.eventId || "");
      if (!isUuid(eventId)) return NextResponse.json({ error: "Gyldig kalenderhendelse kreves." }, { status: 400 });

      const { data: event, error: eventError } = await care
        .from("kh_calendar_events")
        .select("*")
        .eq("id", eventId)
        .eq("event_type", "inspection")
        .maybeSingle();
      if (eventError) throw eventError;
      if (!event) return NextResponse.json({ error: "Care-besøket ble ikke funnet." }, { status: 404 });
      if (event.status === "cancelled" || event.status === "done") return NextResponse.json({ error: "Dette besøket kan ikke startes." }, { status: 409 });
      if (event.inspection_id) return NextResponse.json({ success: true, inspectionId: event.inspection_id, reused: true });

      const [{ data: property, error: propertyError }, { data: contract, error: contractError }] = await Promise.all([
        care.from("kh_properties").select("*").eq("id", event.property_id).maybeSingle(),
        care.from("kh_contracts").select("*").eq("property_id", event.property_id).in("status", ["active", "renewal_due"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (propertyError) throw propertyError;
      if (contractError) throw contractError;
      if (!property) return NextResponse.json({ error: "Care-eiendommen mangler." }, { status: 404 });
      if (!contract) return NextResponse.json({ error: "Aktiv Care-avtale mangler." }, { status: 409 });

      const { data: template, error: templateError } = await care
        .from("kh_checklist_templates")
        .select("*")
        .eq("org_id", event.org_id)
        .eq("is_active", true)
        .contains("property_types", [property.property_type])
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (templateError) throw templateError;
      if (!template) return NextResponse.json({ error: "Ingen aktiv sjekklistemal passer denne boligtypen." }, { status: 409 });

      const { data: checklist, error: checklistError } = await care
        .from("kh_checklist_items")
        .select("id,code,sort_order,category,requires_photo,requires_value,value_unit,applies_to,is_automatic")
        .eq("template_id", template.id)
        .contains("applies_to", [property.property_type])
        .order("sort_order", { ascending: true });
      if (checklistError) throw checklistError;

      const inspectorId = await resolveInspectorUserId(request, supabase);
      if (!inspectorId) {
        return NextResponse.json({ error: "Innlogget Care-bruker finnes ikke i Supabase Auth. Opprett/aktiver brukeren før tilsyn kan registreres." }, { status: 409 });
      }
      await care.from("org_members").upsert({
        org_id: event.org_id,
        user_id: inspectorId,
        role: "inspector",
        locale: "nb",
      }, { onConflict: "org_id,user_id" });

      const now = new Date().toISOString();
      const inspectionId = randomUUID();
      const templateSnapshot = {
        id: template.id,
        code: template.code,
        version: template.version,
        name: template.name,
        min_photos: template.min_photos,
        property_type: property.property_type,
        items: checklist || [],
      };
      const { error: inspectionError } = await care.from("kh_inspections").insert({
        id: inspectionId,
        org_id: event.org_id,
        property_id: event.property_id,
        contract_id: contract.id,
        template_id: template.id,
        template_snapshot: templateSnapshot,
        inspector_id: inspectorId,
        kind: "scheduled",
        is_billable: event.is_billable !== false,
        status: "draft",
        started_at: now,
        gps_status: "unavailable",
        comment: { source_event_id: event.id },
      });
      if (inspectionError) throw inspectionError;

      const itemRows = (checklist || []).map((item: any) => ({
        id: randomUUID(),
        org_id: event.org_id,
        inspection_id: inspectionId,
        item_code: item.code,
        status: item.code === "arrival.checkin" ? "ok" : "not_checked",
        value_unit: item.value_unit || null,
        note: item.code === "arrival.checkin" ? { automatic: true } : null,
        recorded_at: now,
      }));
      if (itemRows.length) {
        const { error: itemError } = await care.from("kh_inspection_items").insert(itemRows);
        if (itemError) throw itemError;
      }

      const { error: eventUpdateError } = await care
        .from("kh_calendar_events")
        .update({ inspection_id: inspectionId })
        .eq("id", event.id)
        .is("inspection_id", null);
      if (eventUpdateError) throw eventUpdateError;

      return NextResponse.json({ success: true, inspectionId }, { status: 201 });
    }

    return NextResponse.json({ error: "Ukjent Care-besøkshandling." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Care-besøkshandlingen feilet." }, { status: 500 });
  }
}
