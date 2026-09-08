import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { decidePortalIntent, portalWorkItemMetadata, type PortalIntentSignal } from "@/lib/nexus/portal-intent-policy";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["session_active", "property_view"] as const);

type ActivityInput = "session_active" | "property_view";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function bucket30m(date = new Date()) {
  const minutes = date.getUTCMinutes() < 30 ? "00" : "30";
  return `${date.toISOString().slice(0, 13)}:${minutes}`;
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email) return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const requested = String(body.signal || "").trim() as ActivityInput;
  if (!ALLOWED.has(requested)) return NextResponse.json({ error: "Unsupported portal signal" }, { status: 400 });

  const propertyId = requested === "property_view" ? String(body.propertyId || "").trim() : "";
  if (requested === "property_view" && !propertyId) {
    return NextResponse.json({ error: "propertyId is required for property_view" }, { status: 400 });
  }

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,name,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return NextResponse.json({ error: contactError.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Portal contact not found" }, { status: 404 });
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return NextResponse.json({ error: "Portal access is not active for this contact" }, { status: 403 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const brandId = String(contact.brand_id || contact.brand || "zeneco");
  let effectiveSignal: PortalIntentSignal = requested;
  let propertyRef: string | null = null;

  if (requested === "property_view") {
    const { data: property, error: propertyError } = await supabase
      .from("properties")
      .select("id,ref,title,title_no")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) return NextResponse.json({ error: propertyError.message }, { status: 500 });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
    propertyRef = String(property.ref || property.title_no || property.title || propertyId);

    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("revenue_events")
      .select("id", { count: "exact", head: true })
      .eq("contact_id", contact.id)
      .eq("source_system", "portal")
      .eq("source_type", "portal_property_view")
      .eq("source_id", propertyId)
      .gte("occurred_at", since);
    if ((count || 0) >= 1) effectiveSignal = "repeat_property_view";
  }

  const decision = decidePortalIntent(effectiveSignal);
  const sourceType = requested === "session_active" ? "portal_session" : "portal_property_view";
  const sourceId = requested === "session_active" ? contact.id : propertyId;
  const event = await insertRevenueEvent(supabase, {
    eventType: "note",
    title: effectiveSignal === "repeat_property_view"
      ? "Kunden ser samme bolig igjen på Min side"
      : requested === "property_view"
        ? "Kunden så en bolig på Min side"
        : "Kunden er aktiv på Min side",
    description: propertyRef || "Autentisert aktivitet i kundeportalen",
    contactId: contact.id,
    brandId,
    sourceSystem: "portal",
    sourceType,
    sourceId,
    actorType: "customer",
    confidenceScore: decision.aiScore,
    occurredAt: nowIso,
    dedupeKey: buildRevenueEventDedupeKey(["portal", requested, contact.id, sourceId, bucket30m(now)]),
    metadata: {
      portal_signal: effectiveSignal,
      requested_signal: requested,
      property_id: propertyId || null,
      property_ref: propertyRef,
      hot_lead: decision.hotLead,
      response_sla_minutes: decision.responseMinutes,
      operational_target: decision.operationalTarget,
    },
    createdBy: "api/portal/messages/activity",
  });

  if (requested === "session_active") {
    await supabase.from("portal_users").update({ status: "active", last_login_at: nowIso, updated_at: nowIso }).ilike("email", email);
  }

  if (decision.createWorkItem && !event.duplicate) {
    const metadata = {
      ...portalWorkItemMetadata(effectiveSignal, nowIso),
      contact_id: contact.id,
      property_id: propertyId || null,
      property_ref: propertyRef,
      portal_activity: true,
    };
    const source = `portal_intent:${contact.id}:${effectiveSignal}:${propertyId || "session"}`;
    const { data: existing } = await supabase
      .from("work_items")
      .select("id")
      .eq("source_type", "portal_intent")
      .eq("source_id", source)
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .limit(1)
      .maybeSingle();

    const workItem = {
      title: effectiveSignal === "repeat_property_view"
        ? `Kunden ser samme bolig igjen: ${contact.name || email}`
        : `Aktivt kjøpssignal på Min side: ${contact.name || email}`,
      description: propertyRef || decision.reason,
      priority: decision.priority,
      due_date: nowIso.slice(0, 10),
      brand_id: brandId,
      source_type: "portal_intent",
      source_id: source,
      assigned_agent: "sales",
      next_action: effectiveSignal === "repeat_property_view"
        ? "Kunden har kommet tilbake til samme bolig. Sjekk aktivitet og ta raskt kontakt med relevant informasjon eller neste konkrete steg."
        : "Følg opp det aktive kjøpssignalet mens kunden er engasjert.",
      ai_score: decision.aiScore,
      metadata,
      updated_at: nowIso,
    };
    if (existing?.id) await supabase.from("work_items").update(workItem).eq("id", existing.id);
    else await supabase.from("work_items").insert({ ...workItem, status: "TO_DO", created_at: nowIso });
  }

  return NextResponse.json({
    success: true,
    signal: effectiveSignal,
    hotLead: decision.hotLead,
    responseMinutes: decision.responseMinutes,
    duplicate: Boolean(event.duplicate),
  }, { headers: { "cache-control": "private, no-store" } });
}
