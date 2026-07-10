import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/reset-password",
  "/reset-password",
  "/api/properties",
  "/api/plots",
  "/api/area-profiles",
  "/api/public/leads",
  "/api/public/booking-leads",
  "/api/public/booking-config",
  "/api/public/booking-availability",
  "/api/public/website-content",
  "/api/portal/preferences",
  "/api/portal/documents",
  "/api/portal/messages",
  "/api/chatbot",
  "/api/health",
  "/api/oauth/google",
  "/api/oauth/google/callback",
  "/api/oauth/google/finalize",
  "/oauth/select",
  "/oauth/remaster-return",
  "/demosites/preview",
  "/demosites/claim",
  "/api/saas/demosites/request",
  "/api/saas/demosites/claim",
];

const REMASTER_PROXY_PATHS = [
  "/api/neural-beat",
  "/api/neural-beat/analytics",
  "/api/neural-beat/autopilot-run",
  "/api/neural-beat/autopilot-settings",
  "/api/neural-beat/image-bank",
  "/api/neural-beat/recommendations-safe",
  "/api/neural-beat/upload",
  "/api/youtube/status",
];

const REMASTER_PROXY_PREFIXES = [
  "/api/neural-beat/jobs",
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

function isRemasterProxyPath(pathname: string) {
  return (
    REMASTER_PROXY_PATHS.includes(pathname) ||
    REMASTER_PROXY_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
}

function hasValidCronCredential(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const querySecret = request.nextUrl.searchParams.get("key")?.trim();

  return bearer === cronSecret || headerSecret === cronSecret || querySecret === cronSecret;
}

function safeLeadIntelligenceReturnPath(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/lead-intelligence") || trimmed.startsWith("//")) return null;

  try {
    const url = new URL(trimmed, "https://realtyflow.local");
    if (url.pathname !== "/lead-intelligence") return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function leadIntelligenceReturnPathFromReferer(request: NextRequest) {
  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    const refererUrl = new URL(referer);
    if (refererUrl.origin !== request.nextUrl.origin) return null;
    return safeLeadIntelligenceReturnPath(`${refererUrl.pathname}${refererUrl.search}`);
  } catch {
    return null;
  }
}

function inventoryLeadIntelligenceReturnRedirect(request: NextRequest) {
  const { nextUrl } = request;
  if (nextUrl.pathname !== "/inventory") return null;

  const openedPropertyFromQuery = nextUrl.searchParams.has("propertyId") || nextUrl.searchParams.has("propertyRef");
  if (!openedPropertyFromQuery || nextUrl.searchParams.has("returnTo")) return null;

  const returnTo = leadIntelligenceReturnPathFromReferer(request);
  if (!returnTo) return null;

  const redirectUrl = nextUrl.clone();
  redirectUrl.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(redirectUrl);
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodePayload<T>(value: string): T {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function verifyToken(token?: string) {
  const secret = process.env.REALTYFLOW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !secret) return false;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const validSignature = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload));
  if (!validSignature) return false;

  try {
    const data = decodePayload<{ email?: string; exp?: number }>(payload);
    const allowedEmails = (process.env.REALTYFLOW_ADMIN_EMAILS || "freddy.bremseth@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    return Boolean(data.email && data.exp && data.exp > Date.now() && allowedEmails.includes(data.email.toLowerCase()));
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  // Sikkerhet: fjern evt. forfalsket verdi. Settes kun når cookie er verifisert.
  requestHeaders.delete("x-admin-authenticated");

  // Den gamle Neural Beat-siden kunne masseutføre alle AI-anbefalinger, inkludert
  // YouTube-metadata, uten individuell godkjenning. GET-analyse er fortsatt tillatt,
  // men alle utførende kall må gå gjennom recommendations-safe og Re-Master Admin.
  if (pathname === "/api/neural-beat/recommendations" && request.method === "POST") {
    return NextResponse.json(
      {
        error: "Den gamle masseutføringen er deaktivert. Godkjenn tiltak individuelt i Re-Master Admin.",
        reason: "legacy_autopilot_disabled",
      },
      { status: 409 },
    );
  }

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (
    migrationSecret &&
    isRemasterProxyPath(pathname) &&
    request.headers.get("x-remaster-migration-secret") === migrationSecret
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Vercel Cron sender "Authorization: Bearer <CRON_SECRET>" automatisk når
  // CRON_SECRET er satt. Slipp gjennom cron-ruter som bærer riktig token, slik
  // at de faktisk kjører i produksjon (uten dette redirectes de til /login).
  // Hver cron-rute verifiserer CRON_SECRET på nytt internt, så dette er trygt.
  const isCronPath =
    pathname.startsWith("/api/cron") ||
    pathname === "/api/neural-beat/cron" ||
    pathname === "/api/neural-beat/thumbnail-ab" ||
    pathname === "/api/neural-beat/shorts-followup";
  if (isCronPath && hasValidCronCredential(request)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const isAllowed = await verifyToken(request.cookies.get("realtyflow_admin")?.value);
  if (isAllowed) {
    const inventoryRedirect = inventoryLeadIntelligenceReturnRedirect(request);
    if (inventoryRedirect) return inventoryRedirect;

    requestHeaders.set("x-admin-authenticated", "true");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const loginUrl = new URL("/login", request.url);
  const nextPath = `${pathname}${request.nextUrl.search || ""}`;
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
