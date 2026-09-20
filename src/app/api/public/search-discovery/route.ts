import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const AI_SOURCES = new Set(["chatgpt", "microsoft_copilot", "perplexity", "google_gemini"]);

const BRAND_BY_ORIGIN: Record<string, string> = {
  "https://www.zenecohomes.com": "zeneco",
  "https://zenecohomes.com": "zeneco",
  "https://www.pinosoecolife.com": "pinosoecolife",
  "https://pinosoecolife.com": "pinosoecolife",
  "https://www.freddybremseth.com": "freddyb",
  "https://freddybremseth.com": "freddyb",
  "https://books.freddybremseth.com": "freddypublishing",
  "https://art.freddybremseth.com": "freddyart",
  "https://remaster.freddybremseth.com": "remasterfreddy",
  "https://www.donaanna.com": "donaanna",
  "https://donaanna.com": "donaanna",
  "https://www.chatgenius.pro": "chatgenius",
  "https://chatgenius.pro": "chatgenius",
};

const SOURCE_BY_HOST: Array<[RegExp, string]> = [
  [/(^|\.)google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/i, "google_search"],
  [/(^|\.)bing\.com$/i, "bing_search"],
  [/(^|\.)chatgpt\.com$/i, "chatgpt"],
  [/^copilot\.microsoft\.com$/i, "microsoft_copilot"],
  [/(^|\.)perplexity\.ai$/i, "perplexity"],
  [/^gemini\.google\.com$/i, "google_gemini"],
  [/^search\.brave\.com$/i, "brave_search"],
  [/(^|\.)duckduckgo\.com$/i, "duckduckgo"],
];

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function classifyReferrer(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const match = SOURCE_BY_HOST.find(([pattern]) => pattern.test(host));
    return match ? { source: match[1], host } : null;
  } catch {
    return null;
  }
}

function allowedOrigin(request: NextRequest) {
  const raw = (request.headers.get("origin") || "").trim().replace(/\/$/, "").toLowerCase();
  return raw && BRAND_BY_ORIGIN[raw] ? raw : "";
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
  const path = typeof body.path === "string" ? body.path.trim() : "";
  const referrer = typeof body.referrer === "string" ? body.referrer.trim() : "";
  const classified = classifyReferrer(referrer);

  if (!classified || !path.startsWith("/") || path.startsWith("//") || path.length > 500 || /[\x00-\x1f]/.test(path)) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  const brandId = BRAND_BY_ORIGIN[origin];
  const cleanPath = path.split("?")[0].split("#")[0] || "/";

  const { error } = await supabase.from("search_discovery_events").insert({
    brand_id: brandId,
    source: classified.source,
    path: cleanPath,
    referrer_host: classified.host,
    occurred_at: new Date().toISOString(),
  });

  if (error) console.warn("[PortfolioDiscovery] Could not store event", error.message);

  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
