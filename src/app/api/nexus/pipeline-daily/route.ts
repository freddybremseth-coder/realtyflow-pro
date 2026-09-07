import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

const KNOWN_PIPELINE_STATUSES = new Set(["NEW","CONTACT","QUALIFIED","MATCHING","VIEWING","NEGOTIATION","RESERVED","ON_HOLD","LOST","WON"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
}

function daysSince(value: unknown) {
  if (!value) return null;
  const ms = Date.now() - new Date(String(value)).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

function customerHref(id: string) {
  return `/customers?contactId=${encodeURIComponent(id)}&tab=all`;
}

function nextMove(contact: any, staleDays: number | null) {
  const status = String(contact.pipeline_status || "NEW").toUpperCase();
  if (contact.do_not_contact || contact.email_suppressed || status === "LOST" || status === "WON") return null;
  const href = customerHref(String(contact.id));
  if (!KNOWN_PIPELINE_STATUSES.has(status)) return { action: "Avklar pipeline-status", reason: `Ukjent status «${status}» må normaliseres før Nexus kan gi et sikkert salgsforslag`, href };
  if (status === "NEW") return { action: "Kvalifiser lead", reason: "Ny kontakt uten dokumentert fremdrift", href };
  if (status === "CONTACT" && (staleDays ?? 99) >= 2) return { action: "Send personlig oppfølging", reason: `${staleDays} dager uten ny aktivitet`, href };
  if (status === "QUALIFIED" && (staleDays ?? 99) >= 3) return { action: "Foreslå 2–3 konkrete boliger", reason: "Kvalifisert kunde uten ny bevegelse", href };
  if (status === "MATCHING" && (staleDays ?? 99) >= 2) return { action: "Oppdater shortlist og kontakt kunden", reason: "Matchingsfasen mangler fersk aktivitet", href };
  if (status === "VIEWING" && (staleDays ?? 99) >= 1) return { action: "Avklar neste steg etter visning", reason: "Visningskunde uten fersk registrert aktivitet", href };
  if (status === "NEGOTIATION" && (staleDays ?? 99) >= 1) return { action: "Følg opp forhandling i dag", reason: "Aktiv forhandling bør ikke stå stille", href };
  if (status === "RESERVED" && (staleDays ?? 99) >= 2) return { action: "Kontroller closing-milepæl", reason: "Reservert handel uten fersk registrert aktivitet", href };
  if (status === "ON_HOLD" && (staleDays ?? 99) >= 14) return { action: "Avklar om kunden fortsatt skal stå på vent", reason: `${staleDays} dager i ro`, href };
  if ((staleDays ?? 0) >= 7) return { action: "Reaktiver eller avklar interesse", reason: `${staleDays} dager uten aktivitet`, href };
  return null;
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [contactsR, inboundR, workR] = await Promise.all([
    supabase.from("contacts").select("id,name,email,brand_id,brand,pipeline_status,updated_at,last_contact,last_inbound_reply_at,next_followup,email_suppressed,do_not_contact,lost_reason").order("updated_at", { ascending: false }).limit(3000),
    supabase.from("email_messages").select("id,crm_contact_id,crm_reply_classification,received_at,created_at").eq("direction", "inbound").gte("received_at", since24).limit(1000),
    supabase.from("work_items").select("id,status,priority,source_type,metadata,created_at,updated_at").gte("updated_at", since7d).limit(2000),
  ]);
  for (const result of [contactsR, inboundR, workR]) if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

  const contacts = contactsR.data || [];
  const inbound = inboundR.data || [];
  const openWorkByContact = new Map<string, number>();
  for (const item of (workR.data || []) as any[]) {
    const cid = String(item?.metadata?.contact_id || item?.metadata?.contactId || "");
    if (!cid || ["DONE","COMPLETED","CANCELLED"].includes(String(item.status || "").toUpperCase())) continue;
    openWorkByContact.set(cid, (openWorkByContact.get(cid) || 0) + 1);
  }

  const movement = contacts.map((contact: any) => {
    const activityAt = contact.last_inbound_reply_at || contact.last_contact || contact.updated_at;
    const staleDays = daysSince(activityAt);
    return {
      id: contact.id,
      name: contact.name || contact.email || "Ukjent kunde",
      email: contact.email,
      brand: contact.brand_id || contact.brand,
      pipelineStatus: contact.pipeline_status || "NEW",
      activityAt,
      staleDays,
      openWork: openWorkByContact.get(String(contact.id)) || 0,
      nextMove: nextMove(contact, staleDays),
    };
  });

  const active = movement.filter((row: any) => !["LOST","WON"].includes(String(row.pipelineStatus).toUpperCase()));
  const stalled = active.filter((row: any) => row.nextMove).sort((a: any,b: any) => Number(b.staleDays || 0) - Number(a.staleDays || 0));
  const stages = active.reduce<Record<string, number>>((acc, row: any) => {
    const key = String(row.pipelineStatus || "NEW").toUpperCase();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const unknownStages = Object.fromEntries(Object.entries(stages).filter(([stage]) => !KNOWN_PIPELINE_STATUSES.has(stage)));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      activePipeline: active.length,
      inboundReplies24h: inbound.filter((row: any) => row.crm_contact_id && ["active_reply","purchased","unsubscribe","informational"].includes(String(row.crm_reply_classification || ""))).length,
      stalled: stalled.length,
      noActivity7d: active.filter((row: any) => Number(row.staleDays || 0) >= 7).length,
      openWork: Array.from(openWorkByContact.values()).reduce((a,b) => a+b, 0),
      unknownPipelineStatus: Object.values(unknownStages).reduce((sum, count) => sum + Number(count || 0), 0),
    },
    stages,
    unknownStages,
    stalled: stalled.slice(0, 40),
    recentlyMoved: movement.filter((row: any) => Number(row.staleDays ?? 99) <= 1).slice(0, 40),
    note: "Stagnasjon er beslutningsstøtte basert på siste dokumenterte CRM-aktivitet og pipeline-status. Ukjente statusverdier flagges for avklaring. Ingen automatiske kundekontakter utføres her.",
  });
}
