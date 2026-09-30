import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildRevenueEventDedupeKey,
  insertRevenueEvent,
} from "@/lib/revenue/events";
import { decidePortalIntent, portalResponseDueAt, portalWorkItemMetadata } from "@/lib/nexus/portal-intent-policy";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function compact(value: unknown) {
  return typeof value === "string" ? value.trim() : value;
}

function formatPreferences(preferences: Record<string, unknown>) {
  const labels: Record<string, string> = {
    budgetMin: "Budsjett fra",
    budgetMax: "Budsjett til",
    region: "Region",
    area: "Område/sted",
    propertyType: "Boligtype",
    bedrooms: "Soverom",
    bathrooms: "Bad",
    lifestyle: "Livsstil",
    timeline: "Tidslinje",
    wantsPlots: "Vurderer tomt",
    minPlotArea: "Tomteareal fra",
    maxPlotPrice: "Tomtepris til",
    notes: "Notat",
  };

  return Object.entries(preferences)
    .map(([key, value]) => [key, compact(value)] as const)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null && value !== false)
    .map(([key, value]) => `${labels[key] || key}: ${value === true ? "Ja" : value}`)
    .join("\n");
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) {
    return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });
  }

  const email = user.email.toLowerCase();
  const { data: contact, error } = await supabase
    .from("contacts")
    .select("id,email,interactions")
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const interactions = Array.isArray(contact?.interactions) ? contact.interactions : [];
  let preferences: Record<string, unknown> = {};

  for (const interaction of interactions) {
    const metadata = interaction && typeof interaction === "object"
      ? (interaction as Record<string, any>).metadata
      : null;
    const candidate = metadata && typeof metadata === "object"
      ? (metadata as Record<string, any>).buyer_preferences
      : null;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      preferences = candidate as Record<string, unknown>;
      break;
    }
  }

  return NextResponse.json({ success: true, preferences, contactId: contact?.id || null });
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase service role is not configured" }, { status: 500 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Missing portal session" }, { status: 401 });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData.user;
  if (userError || !user?.email) {
    return NextResponse.json({ error: "Invalid portal session" }, { status: 401 });
  }

  const body = await request.json();
  const preferences = (body.preferences || {}) as Record<string, unknown>;
  const summary = formatPreferences(preferences);
  if (!summary) return NextResponse.json({ error: "No preferences supplied" }, { status: 400 });

  const now = new Date().toISOString();
  const decision = decidePortalIntent("preferences_updated");
  const followupAt = portalResponseDueAt(now, decision.responseMinutes) || now;
  const email = user.email.toLowerCase();

  const { data: existing } = await supabase
    .from("contacts")
    .select("id,name,email,phone,notes,interactions,tags,pipeline_status,source")
    .ilike("email", email)
    .maybeSingle();

  const signal = {
    id: `portal_signal_${Date.now()}`,
    type: "note",
    source: "min-side",
    direction: "in",
    date: now.split("T")[0],
    content: `KJØPSSIGNAL: Kunden oppdaterte ønsker i Min side.\n${summary}`,
  };

  const tags = Array.from(new Set([...(Array.isArray(existing?.tags) ? existing.tags : []), "kundeportal", "kjøpssignal"]));
  const previousNotes = existing?.notes ? `${existing.notes}\n\n` : "";
  const notes = `${previousNotes}[${now.split("T")[0]}] Min side oppdatert\n${summary}`;
  const pipelineStatus = existing?.pipeline_status === "NEW" ? "CONTACT" : existing?.pipeline_status || "CONTACT";

  const payload = {
    name: existing?.name || user.user_metadata?.name || email,
    email,
    notes,
    tags,
    pipeline_status: pipelineStatus,
    pipeline_value: Number(preferences.budgetMax || preferences.budgetMin || 0) || 0,
    property_interest: [preferences.region, preferences.area, preferences.propertyType].filter(Boolean).join(" / "),
    source: existing?.id ? existing.source || "zenecohomes-portal" : "zenecohomes-portal",
    brand: "zeneco",
    brand_id: "zeneco",
    next_followup: followupAt,
    interactions: [signal, ...(Array.isArray(existing?.interactions) ? existing.interactions : [])],
    updated_at: now,
    created_at: existing?.id ? undefined : now,
  };

  const query = existing?.id
    ? supabase.from("contacts").update(payload).eq("id", existing.id).select().single()
    : supabase.from("contacts").insert(payload).select().single();

  const { data: contact, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventResult = await insertRevenueEvent(supabase, {
    eventType: existing?.id ? "contact_updated" : "profile_created",
    title: "Kunden oppdaterte boligønsker på Min side",
    description: summary.slice(0, 500),
    contactId: contact.id,
    brandId: contact.brand_id || "zeneco",
    sourceSystem: "portal",
    sourceType: "preferences_updated",
    sourceId: signal.id,
    actorType: "customer",
    confidenceScore: decision.aiScore,
    occurredAt: now,
    dedupeKey: buildRevenueEventDedupeKey([
      "portal",
      "preferences_updated",
      contact.id,
      signal.id,
    ]),
    metadata: {
      email,
      preferences,
      summary,
      signal_id: signal.id,
      previous_pipeline_status: existing?.pipeline_status || null,
      pipeline_status: pipelineStatus,
      next_followup: followupAt,
      property_interest: payload.property_interest,
      pipeline_value: payload.pipeline_value,
      portal_signal: "preferences_updated",
      hot_lead: decision.hotLead,
      response_sla_minutes: decision.responseMinutes,
      response_due_at: followupAt,
      operational_target: decision.operationalTarget,
    },
    createdBy: "api/portal/preferences",
  });

  if (!eventResult.ok && !eventResult.tableNotReady) {
    console.warn("[portal/preferences] revenue event insert failed", eventResult.error);
  }

  const workItemPayload = {
    title: `Kunden oppdaterte boligønsker: ${contact.name || email}`,
    description: summary.slice(0, 500),
    priority: decision.priority,
    due_date: followupAt.slice(0, 10),
    brand_id: contact.brand_id || "zeneco",
    source_type: "crm",
    source_id: contact.id,
    assigned_agent: "sales",
    next_action: "Match 3–5 relevante boliger mot de nye ønskene og svar kunden personlig i Min side eller på e-post.",
    ai_score: decision.aiScore,
    metadata: {
      ...portalWorkItemMetadata("preferences_updated", now),
      portal_preferences: true,
      email,
      signal_id: signal.id,
      summary,
      preferences,
      property_interest: payload.property_interest,
      pipeline_value: payload.pipeline_value,
      contact_id: contact.id,
    },
    updated_at: now,
  };

  const { data: existingWorkItem, error: workItemLookupError } = await supabase
    .from("work_items")
    .select("id")
    .eq("source_type", "crm")
    .eq("source_id", contact.id)
    .in("status", ["TO_DO", "IN_PROGRESS", "REVIEW"])
    .contains("metadata", { portal_preferences: true })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (workItemLookupError) {
    console.warn("[portal/preferences] work item lookup failed", workItemLookupError.message);
  } else if (existingWorkItem?.id) {
    const { error: workItemUpdateError } = await supabase
      .from("work_items")
      .update(workItemPayload)
      .eq("id", existingWorkItem.id);
    if (workItemUpdateError) {
      console.warn("[portal/preferences] work item update failed", workItemUpdateError.message);
    }
  } else {
    const { error: workItemInsertError } = await supabase
      .from("work_items")
      .insert({ ...workItemPayload, status: "TO_DO", created_at: now });
    if (workItemInsertError) {
      console.warn("[portal/preferences] work item insert failed", workItemInsertError.message);
    }
  }

  const savedSearchCriteria = {
    area: String(preferences.area || "").slice(0, 160),
    region: String(preferences.region || "").slice(0, 160),
    budgetMin: String(preferences.budgetMin || "").slice(0, 40),
    budgetMax: String(preferences.budgetMax || "").slice(0, 40),
    bedrooms: String(preferences.bedrooms || "").slice(0, 20),
    bathrooms: String(preferences.bathrooms || "").slice(0, 20),
    propertyType: String(preferences.propertyType || "").slice(0, 80),
    lifestyle: String(preferences.lifestyle || "").slice(0, 80),
    timeline: String(preferences.timeline || "").slice(0, 80),
    wantsPlots: Boolean(preferences.wantsPlots),
    minPlotArea: String(preferences.minPlotArea || "").slice(0, 40),
    maxPlotPrice: String(preferences.maxPlotPrice || "").slice(0, 40),
  };

  const { data: currentSavedSearch } = await supabase
    .from("portal_saved_searches")
    .select("id,alerts_enabled")
    .eq("contact_id", contact.id)
    .eq("brand_id", "zeneco")
    .maybeSingle();

  const confirmationDueAt = new Date(Date.parse(now) + 2 * 60 * 60 * 1000).toISOString();
  const { error: savedSearchError } = await supabase
    .from("portal_saved_searches")
    .upsert({
      contact_id: contact.id,
      brand_id: "zeneco",
      name: "Mitt boligsøk",
      criteria: savedSearchCriteria,
      alerts_enabled: currentSavedSearch?.alerts_enabled !== false,
      criteria_updated_at: now,
      confirmation_due_at: confirmationDueAt,
      confirmation_sent_at: null,
      confirmed_at: null,
      updated_at: now,
    }, { onConflict: "contact_id,brand_id" });

  if (savedSearchError) {
    console.warn("[portal/preferences] saved search sync failed", savedSearchError.message);
  }

  await supabase
    .from("portal_users")
    .update({ status: "active", last_login_at: now, updated_at: now })
    .ilike("email", email);

  return NextResponse.json({ success: true, contactId: contact.id, signal });
}
