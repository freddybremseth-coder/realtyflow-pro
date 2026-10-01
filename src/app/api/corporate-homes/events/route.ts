import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { CORPORATE_EVENT_SIGNAL_GUARDRAILS } from "@/lib/corporate-event-lifecycle";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request, { events: null });
  if (denied) return denied;

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: rows, error } = await supabase
    .from("corporate_event_participants")
    .select("id,event_id,event_name,email,name,organization_name,contact_role,contact_id,status,registered_at,attended_at,cta_clicked_at,assessment_requested_at,updated_at")
    .eq("brand_id", "zeneco")
    .order("updated_at", { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const registrations = (rows || []).map((row: any) => {
    const status = String(row.status || "REGISTERED").toUpperCase();
    return {
      key: String(row.id),
      participantId: String(row.id),
      contactId: row.contact_id || null,
      name: row.name || null,
      email: String(row.email || ""),
      organizationName: row.organization_name || null,
      contactRole: row.contact_role || null,
      eventId: String(row.event_id || ""),
      eventName: String(row.event_name || row.event_id || ""),
      registeredAt: row.registered_at || null,
      attendanceStatus: status,
      attendanceAt: row.attended_at || null,
      ctaClicked: Boolean(row.cta_clicked_at) || ["CTA_CLICKED", "ASSESSMENT_REQUESTED"].includes(status),
      assessmentRequested: Boolean(row.assessment_requested_at) || status === "ASSESSMENT_REQUESTED",
      salesQualifiedByEvent: false,
    };
  });

  const eventsMap = new Map<string, {
    eventId: string;
    eventName: string;
    registered: number;
    attended: number;
    noShow: number;
    ctaClicks: number;
    assessmentRequests: number;
  }>();

  for (const row of registrations) {
    if (!row.eventId) continue;
    const current = eventsMap.get(row.eventId) || {
      eventId: row.eventId,
      eventName: row.eventName || row.eventId,
      registered: 0,
      attended: 0,
      noShow: 0,
      ctaClicks: 0,
      assessmentRequests: 0,
    };
    current.registered += 1;
    if (["ATTENDED", "CTA_CLICKED", "ASSESSMENT_REQUESTED"].includes(row.attendanceStatus)) current.attended += 1;
    if (row.attendanceStatus === "NO_SHOW") current.noShow += 1;
    if (row.ctaClicked) current.ctaClicks += 1;
    if (row.assessmentRequested) current.assessmentRequests += 1;
    eventsMap.set(row.eventId, current);
  }

  const events = [...eventsMap.values()].map((event) => ({
    ...event,
    attendanceRate: rate(event.attended, event.registered),
    attendeeToAssessmentRate: rate(event.assessmentRequests, event.attended),
  }));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    events,
    registrations,
    guardrails: {
      registrationIsLead: false,
      attendanceQualifiesAutomatically: false,
      ...CORPORATE_EVENT_SIGNAL_GUARDRAILS,
    },
  });
}
