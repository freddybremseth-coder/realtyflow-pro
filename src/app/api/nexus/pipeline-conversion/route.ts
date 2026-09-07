import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

const ORDER = ["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","WON"] as const;

function transitionKey(previousStatus: unknown, nextStatus: unknown) {
  return `${String(previousStatus || "").toUpperCase()}→${String(nextStatus || "").toUpperCase()}`;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getServiceSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const daysParam = Number(new URL(request.url).searchParams.get("days") || 30);
  const days = [7,30,90].includes(daysParam) ? daysParam : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [contactsR, eventsR] = await Promise.all([
    supabase.from("contacts").select("id,pipeline_status,email_suppressed,do_not_contact").limit(5000),
    supabase.from("revenue_events")
      .select("id,contact_id,brand_id,occurred_at,metadata,created_at")
      .eq("event_type", "contact_updated")
      .eq("source_system", "crm_pipeline")
      .eq("source_type", "pipeline_stage_changed")
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(5000),
  ]);
  if (contactsR.error) return NextResponse.json({ error: contactsR.error.message }, { status: 500 });
  if (eventsR.error) return NextResponse.json({ error: eventsR.error.message }, { status: 500 });

  const snapshot = (contactsR.data || []).reduce<Record<string, number>>((acc, row: any) => {
    if (row.do_not_contact || row.email_suppressed) return acc;
    const stage = String(row.pipeline_status || "NEW").toUpperCase();
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  const events = (eventsR.data || []).map((event: any) => ({
    ...event,
    previousStatus: String(event?.metadata?.previous_status || "").toUpperCase(),
    nextStatus: String(event?.metadata?.next_status || "").toUpperCase(),
  })).filter((event: any) => event.previousStatus && event.nextStatus && event.previousStatus !== event.nextStatus);

  const transitionCounts = events.reduce<Record<string, number>>((acc, event: any) => {
    const key = transitionKey(event.previousStatus, event.nextStatus);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const forward = ORDER.slice(0,-1).map((stage, index) => {
    const next = ORDER[index + 1];
    const count = transitionCounts[`${stage}→${next}`] || 0;
    const exits = events.filter((event: any) => event.previousStatus === stage).length;
    return {
      from: stage,
      to: next,
      transitions: count,
      measuredExits: exits,
      forwardShare: exits > 0 ? Math.round((count / exits) * 1000) / 10 : null,
    };
  });

  const firstTrackedAt = events.length ? String(events[0].occurred_at || events[0].created_at || "") : null;
  const latestTrackedAt = events.length ? String(events[events.length - 1].occurred_at || events[events.length - 1].created_at || "") : null;
  const uniqueContacts = new Set(events.map((event: any) => String(event.contact_id || "")).filter(Boolean)).size;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    windowDays: days,
    tracking: {
      active: events.length > 0,
      firstTrackedAt,
      latestTrackedAt,
      transitionEvents: events.length,
      uniqueContacts,
      historicalComplete: false,
      note: events.length
        ? "Konvertering bygger kun på eksplisitt loggede pipeline-overganger. Historikk før overgangssporing ble aktivert er ikke rekonstruert."
        : "Ingen pipeline-overganger er målt ennå. Dashboardet begynner å samle troverdige konverteringsdata etter at overgangssporing er deployet.",
    },
    snapshot,
    forward,
    transitionCounts,
  });
}
