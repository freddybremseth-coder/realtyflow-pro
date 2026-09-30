import { NextRequest, NextResponse } from "next/server";
import { buildRevenueEventDedupeKey, insertRevenueEvent } from "@/lib/revenue/events";
import { decidePortalIntent, portalWorkItemMetadata } from "@/lib/nexus/portal-intent-policy";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

async function portalContext(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) return { error: NextResponse.json({ error: "Supabase not configured" }, { status: 500 }) };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "Missing portal session" }, { status: 401 }) };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const email = userData.user?.email?.trim().toLowerCase();
  if (userError || !email) return { error: NextResponse.json({ error: "Invalid portal session" }, { status: 401 }) };

  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id,email,brand_id,brand,pipeline_status,email_suppressed,do_not_contact")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (contactError) return { error: NextResponse.json({ error: contactError.message }, { status: 500 }) };
  if (!contact) return { error: NextResponse.json({ error: "Portal contact not found" }, { status: 404 }) };
  if (String(contact.pipeline_status || "").toUpperCase() === "LOST" || contact.email_suppressed || contact.do_not_contact) {
    return { error: NextResponse.json({ error: "Portal access is not active" }, { status: 403 }) };
  }

  return { supabase, contact };
}

export async function GET(request: NextRequest) {
  const context = await portalContext(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const { data, error } = await supabase
    .from("portal_saved_searches")
    .select("id,name,criteria,alerts_enabled,last_checked_at,last_notified_at,criteria_updated_at,confirmation_due_at,confirmation_sent_at,confirmed_at,updated_at")
    .eq("contact_id", contact.id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    search: data || {
      name: "Mitt boligsøk",
      criteria: {},
      alerts_enabled: true,
      last_checked_at: null,
      last_notified_at: null,
      criteria_updated_at: null,
      confirmation_due_at: null,
      confirmation_sent_at: null,
      confirmed_at: null,
    },
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const context = await portalContext(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "").trim();

  const { data: existingSearch } = await supabase
    .from("portal_saved_searches")
    .select("id,name,criteria,alerts_enabled,last_checked_at,last_notified_at,criteria_updated_at,confirmation_due_at,confirmation_sent_at,confirmed_at")
    .eq("contact_id", contact.id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  if (action === "confirm") {
    if (!existingSearch?.id) return NextResponse.json({ error: "Saved search not found" }, { status: 404 });
    const now = new Date().toISOString();
    const { data: confirmed, error: confirmError } = await supabase
      .from("portal_saved_searches")
      .update({
        confirmed_at: now,
        confirmation_due_at: null,
        updated_at: now,
      })
      .eq("id", existingSearch.id)
      .select("id,name,criteria,alerts_enabled,confirmed_at,confirmation_sent_at,updated_at")
      .single();

    if (confirmError) return NextResponse.json({ error: confirmError.message }, { status: 500 });

    const decision = decidePortalIntent("criteria_confirmed");
    await insertRevenueEvent(supabase, {
      eventType: "note",
      title: "Kunden bekreftet boligkriteriene på Min side",
      description: "Kunden bekreftet at de lagrede søkekriteriene fortsatt er riktige.",
      contactId: contact.id,
      brandId: String(contact.brand_id || contact.brand || "zeneco"),
      sourceSystem: "portal",
      sourceType: "criteria_confirmed",
      sourceId: existingSearch.id,
      actorType: "customer",
      confidenceScore: decision.aiScore,
      occurredAt: now,
      dedupeKey: buildRevenueEventDedupeKey(["portal", "criteria_confirmed", contact.id, now.slice(0, 10)]),
      metadata: {
        portal_signal: "criteria_confirmed",
        criteria: existingSearch.criteria || {},
      },
      createdBy: "api/portal/saved-search",
    });

    return NextResponse.json({ success: true, search: confirmed });
  }

  const rawCriteria = body?.criteria && typeof body.criteria === "object" && !Array.isArray(body.criteria)
    ? body.criteria
    : {};

  const criteria = {
    area: String(rawCriteria.area || "").slice(0, 160),
    region: String(rawCriteria.region || "").slice(0, 160),
    budgetMin: String(rawCriteria.budgetMin || "").slice(0, 40),
    budgetMax: String(rawCriteria.budgetMax || "").slice(0, 40),
    bedrooms: String(rawCriteria.bedrooms || "").slice(0, 20),
    bathrooms: String(rawCriteria.bathrooms || "").slice(0, 20),
    propertyType: String(rawCriteria.propertyType || "").slice(0, 80),
    lifestyle: String(rawCriteria.lifestyle || "").slice(0, 80),
    timeline: String(rawCriteria.timeline || "").slice(0, 80),
    wantsPlots: Boolean(rawCriteria.wantsPlots),
    minPlotArea: String(rawCriteria.minPlotArea || "").slice(0, 40),
    maxPlotPrice: String(rawCriteria.maxPlotPrice || "").slice(0, 40),
  };

  const alertsEnabled = body.alertsEnabled !== false;
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const criteriaChanged = JSON.stringify(existingSearch?.criteria || {}) !== JSON.stringify(criteria);
  const alertsChanged = existingSearch ? Boolean(existingSearch.alerts_enabled) !== alertsEnabled : false;
  const confirmationDueAt = criteriaChanged
    ? new Date(nowDate.getTime() + 2 * 60 * 60 * 1000).toISOString()
    : existingSearch?.confirmation_due_at || null;

  const { data, error } = await supabase
    .from("portal_saved_searches")
    .upsert({
      contact_id: contact.id,
      brand_id: "zeneco",
      name: String(body.name || "Mitt boligsøk").slice(0, 120),
      criteria,
      alerts_enabled: alertsEnabled,
      criteria_updated_at: criteriaChanged ? now : existingSearch?.criteria_updated_at || now,
      confirmation_due_at: confirmationDueAt,
      confirmation_sent_at: criteriaChanged ? null : existingSearch?.confirmation_sent_at || null,
      confirmed_at: criteriaChanged ? null : existingSearch?.confirmed_at || null,
      updated_at: now,
    }, { onConflict: "contact_id,brand_id" })
    .select("id,name,criteria,alerts_enabled,last_checked_at,last_notified_at,criteria_updated_at,confirmation_due_at,confirmation_sent_at,confirmed_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (alertsChanged) {
    const decision = decidePortalIntent("alerts_updated");
    const description = alertsEnabled
      ? "Kunden slo på automatiske boligvarsler på Min side."
      : "Kunden slo av automatiske boligvarsler på Min side.";

    await insertRevenueEvent(supabase, {
      eventType: "note",
      title: alertsEnabled ? "Kunden slo på boligvarsler" : "Kunden slo av boligvarsler",
      description,
      contactId: contact.id,
      brandId: String(contact.brand_id || contact.brand || "zeneco"),
      sourceSystem: "portal",
      sourceType: "alerts_updated",
      sourceId: data.id,
      actorType: "customer",
      confidenceScore: decision.aiScore,
      occurredAt: now,
      dedupeKey: buildRevenueEventDedupeKey(["portal", "alerts_updated", contact.id, String(alertsEnabled), now.slice(0, 13)]),
      metadata: {
        portal_signal: "alerts_updated",
        alerts_enabled: alertsEnabled,
        criteria,
      },
      createdBy: "api/portal/saved-search",
    });

    const sourceId = `portal_change:${contact.id}:alerts`;
    const workItem = {
      title: alertsEnabled
        ? `Min side: kunde slo på boligvarsler – ${contact.email}`
        : `Min side: kunde slo av boligvarsler – ${contact.email}`,
      description,
      priority: decision.priority,
      due_date: now.slice(0, 10),
      brand_id: String(contact.brand_id || contact.brand || "zeneco"),
      source_type: "portal_change",
      source_id: sourceId,
      assigned_agent: "sales",
      next_action: alertsEnabled
        ? "Se om de lagrede kriteriene gir gode treff. Ta kontakt hvis kunden virker aktiv eller mangler relevante alternativer."
        : "Vurder om avslag på boligvarsler er et tegn på feil treff, endret timing eller lavere interesse før neste oppfølging.",
      ai_score: decision.aiScore,
      metadata: {
        ...portalWorkItemMetadata("alerts_updated", now),
        contact_id: contact.id,
        portal_change: true,
        alerts_enabled: alertsEnabled,
      },
      updated_at: now,
    };

    const { data: existingWorkItem } = await supabase
      .from("work_items")
      .select("id")
      .eq("source_type", "portal_change")
      .eq("source_id", sourceId)
      .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
      .limit(1)
      .maybeSingle();

    if (existingWorkItem?.id) {
      await supabase.from("work_items").update(workItem).eq("id", existingWorkItem.id);
    } else {
      await supabase.from("work_items").insert({ ...workItem, status: "TO_DO", created_at: now });
    }
  }

  return NextResponse.json({ success: true, search: data });
}
