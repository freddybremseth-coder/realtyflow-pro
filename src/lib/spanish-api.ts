import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

const SPANISH_ORIGINS = new Set([
  "https://spanish.chatgenius.pro",
]);

export function spanishCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!SPANISH_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function spanishJson(request: Request, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: spanishCorsHeaders(request) });
}

export function spanishPreflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: spanishCorsHeaders(request) }) as NextResponse;
}

export async function requireSpanishUser(request: NextRequest) {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return { error: spanishJson(request, { error: "RealtyFlow backend unavailable" }, 503) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: spanishJson(request, { error: "Authentication required" }, 401) };
  }

  const { data, error } = await supabase.auth.getUser(token);
  const user = data.user;
  if (error || !user?.id || !user.email) {
    return { error: spanishJson(request, { error: "Invalid session" }, 401) };
  }

  const { data: ensured, error: ensureError } = await supabase.rpc("spanish_ensure_account", {
    p_user_id: user.id,
  });
  if (ensureError) {
    console.error("[Spanish API] Account bootstrap failed:", ensureError);
    return { error: spanishJson(request, { error: "Could not initialize Spanish account" }, 500) };
  }

  return {
    supabase,
    user,
    ensured,
    token,
  };
}

export async function requireSpanishAdmin(request: NextRequest) {
  const context = await requireSpanishUser(request);
  if ("error" in context) return context;
  if (context.user.email?.trim().toLowerCase() !== "freddy.bremseth@gmail.com") {
    return { error: spanishJson(request, { error: "Admin access required" }, 403) };
  }
  return context;
}
