import { NextRequest, NextResponse } from "next/server";
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
    .select("id,name,criteria,alerts_enabled,last_checked_at,last_notified_at,updated_at")
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
    },
  }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const context = await portalContext(request);
  if ("error" in context) return context.error;
  const { supabase, contact } = context;

  const body = await request.json().catch(() => ({}));
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
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("portal_saved_searches")
    .upsert({
      contact_id: contact.id,
      brand_id: "zeneco",
      name: String(body.name || "Mitt boligsøk").slice(0, 120),
      criteria,
      alerts_enabled: alertsEnabled,
      updated_at: now,
    }, { onConflict: "contact_id,brand_id" })
    .select("id,name,criteria,alerts_enabled,last_checked_at,last_notified_at,updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, search: data });
}
