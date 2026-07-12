import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildRevenueEventDedupeKey,
  insertRevenueEvent,
} from "@/lib/revenue/events";

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
  const followupAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
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
    confidenceScore: 94,
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
    },
    createdBy: "api/portal/preferences",
  });

  if (!eventResult.ok && !eventResult.tableNotReady) {
    console.warn("[portal/preferences] revenue event insert failed", eventResult.error);
  }

  await supabase
    .from("portal_users")
    .update({ status: "active", last_login_at: now, updated_at: now })
    .ilike("email", email);

  return NextResponse.json({ success: true, contactId: contact.id, signal });
}
