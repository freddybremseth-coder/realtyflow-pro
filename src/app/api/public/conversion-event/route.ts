import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const BRAND_BY_ORIGIN: Record<string, string> = {
  "https://www.chatgenius.pro": "chatgenius",
  "https://chatgenius.pro": "chatgenius",
  "https://www.donaanna.com": "donaanna",
  "https://donaanna.com": "donaanna",
};

const ALLOWED_EVENTS = new Set(["next_step", "demo", "trial", "booking", "email", "contact"]);
const ALLOWED_SOURCES = new Set([
  "google_search", "bing_search", "chatgpt", "microsoft_copilot",
  "perplexity", "google_gemini", "brave_search", "duckduckgo",
]);
const ALLOWED_TARGETS = new Set([
  "getting_started", "demo_hub", "demosites_trial", "demosites_demo",
  "realtyflow_demo", "family_demo", "remaster_demo", "booking", "email_contact", "contact_section",
  "tasting_interest", "product_portfolio", "product_hub",
  "verde_vivo", "verde_alto", "raiz_antigua", "cocina_viva", "mesa_gordal_noble",
  "tasting_request_submitted", "tasting_request_verde_vivo", "tasting_request_verde_alto",
  "tasting_request_raiz_antigua", "tasting_request_cocina_viva", "tasting_request_mesa_gordal_noble",
  "restaurant_guide", "guide_hub", "b2b_portal",
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function allowedOrigin(request: NextRequest) {
  const raw = (request.headers.get("origin") || "").trim().replace(/\/$/, "").toLowerCase();
  return raw && BRAND_BY_ORIGIN[raw] ? raw : "";
}

function cleanPath(value: unknown) {
  if (typeof value !== "string") return "";
  const path = value.trim().split("?")[0].split("#")[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300 || /[\x00-\x1f@]/.test(path)) return "";
  return path;
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function OPTIONS(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (!origin) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: NextRequest) {
  const origin = allowedOrigin(request);
  if (!origin) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
  const target = typeof body.target === "string" ? body.target.trim() : "";
  const path = cleanPath(body.path);
  const landingPath = cleanPath(body.landingPath) || null;
  const source = typeof body.discoverySource === "string" && ALLOWED_SOURCES.has(body.discoverySource)
    ? body.discoverySource : null;

  if (!ALLOWED_EVENTS.has(eventType) || !ALLOWED_TARGETS.has(target) || !path) {
    return NextResponse.json({ error: "Invalid conversion event" }, {
      status: 400,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Conversion collector unavailable" }, {
      status: 503,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  try {
    const { error } = await supabase.from("website_conversion_events").insert({
      brand_id: BRAND_BY_ORIGIN[origin],
      event_type: eventType,
      path,
      target,
      landing_path: landingPath,
      discovery_source: source,
      occurred_at: new Date().toISOString(),
    });
    if (error) {
      console.warn("[WebsiteConversion] storage unavailable");
      return NextResponse.json({ error: "Conversion collector unavailable" }, {
        status: 503,
        headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
      });
    }
  } catch {
    return NextResponse.json({ error: "Conversion collector unavailable" }, {
      status: 503,
      headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: { ...corsHeaders(origin), "Cache-Control": "no-store" },
  });
}
