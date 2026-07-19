import { NextRequest, NextResponse } from "next/server";
import {
  accessRequirementForApi,
  canSeeNavHref,
  hasPermission,
  normalizeRole,
  type AccessRole,
} from "@/lib/access-control";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/reset-password",
  "/reset-password",
  "/api/properties",
  "/api/plots",
  "/api/area-profiles",
  "/api/public/version",
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
  "/demosites/present",
  "/api/saas/demosites/request",
  "/api/saas/demosites/claim",
  "/api/saas/demosites/checkout",
  "/sites",
  "/api/saas/demosites/portal/login",
  "/api/saas/demosites/portal/orders",
  "/api/public/demo-inquiry",
  "/api/public/demo-chat",
  "/api/saas/subscribe",
  "/api/saas/stripe",
  "/api/public/books",
  "/api/dona-anna/integrations",
];

const REMASTER_PROXY_PATHS = [
  "/api/neural-beat",
  "/api/neural-beat/analytics",
  "/api/neural-beat/autopilot-run",
  "/api/neural-beat/autopilot-settings",
  "/api/neural-beat/image-bank",
  "/api/neural-beat/library-cleanup",
  "/api/neural-beat/recommendations-safe",
  "/api/neural-beat/upload",
  "/api/youtube/status",
];
const REMASTER_PROXY_PREFIXES = ["/api/neural-beat/jobs"];

const ROLE_HOME: Record<AccessRole, string> = {
  OWNER: "/",
  SALES: "/today",
  CLOSING: "/closing",
  FINANCE: "/monthly-close",
  MARKETING: "/attribution",
  KEYHOLDING: "/service-revenue",
  VIEWER: "/revenue-command",
};

function isPublicPath(pathname: string) {
  return pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/robots.txt" || PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isRemasterProxyPath(pathname: string) {
  return REMASTER_PROXY_PATHS.includes(pathname) || REMASTER_PROXY_PREFIXES.some((path) => pathname === path || pathname.startsWith(`${path}/`));
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

async function verifyToken(token?: string): Promise<{ email: string; role: AccessRole } | null> {
  const secret = process.env.REALTYFLOW_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!token || !secret) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const validSignature = await crypto.subtle.verify("HMAC", key, base64UrlToBytes(signature), new TextEncoder().encode(payload));
  if (!validSignature) return null;
  try {
    const data = decodePayload<{ email?: string; role?: string; exp?: number }>(payload);
    if (!data.email || !data.exp || data.exp <= Date.now()) return null;
    const email = data.email.toLowerCase();
    const ownerEmails = (process.env.REALTYFLOW_ADMIN_EMAILS || "freddy.bremseth@gmail.com").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (ownerEmails.includes(email)) return { email, role: "OWNER" };
    const role = normalizeRole(data.role);
    if (!role || role === "OWNER") return null;
    return { email, role };
  } catch {
    return null;
  }
}

function roleDenied(request: NextRequest, role: AccessRole, requirement: string) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Access permission required", role, requiredPermission: requirement }, { status: 403 });
  }
  return NextResponse.redirect(new URL(ROLE_HOME[role], request.url));
}

const CUSTOMER_SITE_ROOT = process.env.DEMOSITES_ROOT_DOMAIN || "chatgenius.pro";
const RESERVED_SITE_SUBDOMAINS = new Set([
  "www", "api", "mail", "smtp", "imap", "pop", "ftp", "webmail",
  "realtyflow", "appointment", "sider", "app", "admin", "portal",
  "demo", "demosites", "status", "cdn", "static", "ns1", "ns2",
]);

function customerSiteRewrite(request: NextRequest): NextResponse | null {
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  if (!host.endsWith(`.${CUSTOMER_SITE_ROOT}`)) return null;
  const label = host.slice(0, -(CUSTOMER_SITE_ROOT.length + 1));
  if (!label || label.includes(".") || RESERVED_SITE_SUBDOMAINS.has(label)) return null;
  if (request.nextUrl.pathname === "/") return NextResponse.rewrite(new URL(`/sites/${label}`, request.url));
  return null;
}

function shouldLookupCustomDomain(host: string) {
  if (!host || host === "localhost" || host === CUSTOMER_SITE_ROOT) return false;
  if (host.endsWith(`.${CUSTOMER_SITE_ROOT}`) || host.endsWith(".vercel.app")) return false;
  return host.includes(".");
}

/**
 * Customer-owned domains are attached to the same Vercel project. The Host
 * header is looked up against demo_site_orders.custom_domain and rewritten to
 * the matching site_slug. This keeps the customer's URL in the address bar;
 * it is normal multi-tenant routing, not masking or iframe cloaking.
 */
async function customDomainSiteRewrite(request: NextRequest): Promise<NextResponse | null> {
  if (request.nextUrl.pathname !== "/") return null;
  const host = (request.headers.get("host") || "").toLowerCase().split(":")[0];
  if (!shouldLookupCustomDomain(host)) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return null;

  try {
    const query = new URL(`${supabaseUrl}/rest/v1/demo_site_orders`);
    query.searchParams.set("select", "site_slug");
    query.searchParams.set("custom_domain", `eq.${host}`);
    query.searchParams.set("status", "eq.deployed");
    query.searchParams.set("limit", "1");
    const response = await fetch(query, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as Array<{ site_slug?: string | null }>;
    const slug = String(rows[0]?.site_slug || "").trim();
    if (!slug) return null;
    return NextResponse.rewrite(new URL(`/sites/${encodeURIComponent(slug)}`, request.url));
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const siteRewrite = customerSiteRewrite(request) || await customDomainSiteRewrite(request);
  if (siteRewrite) return siteRewrite;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.delete("x-admin-authenticated");
  requestHeaders.delete("x-access-role");
  requestHeaders.delete("x-access-email");

  if (pathname === "/api/neural-beat/recommendations" && request.method === "POST") {
    return NextResponse.json({ error: "Den gamle masseutføringen er deaktivert. Godkjenn tiltak individuelt i Re-Master Admin.", reason: "legacy_autopilot_disabled" }, { status: 409 });
  }

  const migrationSecret = process.env.REALTYFLOW_MIGRATION_SECRET;
  if (migrationSecret && isRemasterProxyPath(pathname) && request.headers.get("x-remaster-migration-secret") === migrationSecret) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (isPublicPath(pathname)) return NextResponse.next({ request: { headers: requestHeaders } });

  const isCronPath = pathname.startsWith("/api/cron") || pathname === "/api/neural-beat/cron" || pathname === "/api/neural-beat/thumbnail-ab" || pathname === "/api/neural-beat/shorts-followup" || pathname === "/api/neural-beat/weekly-mix";
  if (isCronPath && hasValidCronCredential(request)) return NextResponse.next({ request: { headers: requestHeaders } });

  const session = await verifyToken(request.cookies.get("realtyflow_admin")?.value);
  if (session) {
    requestHeaders.set("x-admin-authenticated", "true");
    requestHeaders.set("x-access-role", session.role);
    requestHeaders.set("x-access-email", session.email);

    if (session.role !== "OWNER") {
      const internalAlertsApi = pathname === "/api/internal-alerts";
      const internalAlertsPage = pathname === "/internal-alerts";
      const executiveBriefingApi = pathname === "/api/revenue/executive-briefing";
      const executiveBriefingPage = pathname === "/executive-briefing";
      const operatingReviewPage = pathname === "/operating-review";
      const weeklyManagementReviewPage = pathname === "/weekly-management-review";
      const continuousImprovementPage = pathname === "/continuous-improvement";

      if (executiveBriefingApi) {
        if (!hasPermission(session.role, "revenue.read")) return roleDenied(request, session.role, "revenue.read");
        const rewritten = request.nextUrl.clone();
        rewritten.pathname = "/api/revenue/command/executive-briefing";
        return NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
      }

      if (pathname.startsWith("/api/")) {
        if (!internalAlertsApi) {
          const requirement = accessRequirementForApi(pathname, request.method);
          if (requirement === "OWNER_ONLY" || (requirement !== "AUTHENTICATED" && !hasPermission(session.role, requirement))) return roleDenied(request, session.role, requirement);
        }
      } else if (internalAlertsPage || executiveBriefingPage || operatingReviewPage || weeklyManagementReviewPage || continuousImprovementPage) {
        if (!hasPermission(session.role, "revenue.read")) return roleDenied(request, session.role, "revenue.read");
      } else if (!canSeeNavHref(session.role, pathname)) {
        return roleDenied(request, session.role, "page-access");
      }
    }

    const inventoryRedirect = inventoryLeadIntelligenceReturnRedirect(request);
    if (inventoryRedirect) return inventoryRedirect;
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search || ""}`);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ["/((?!.*\\..*).*)"] };
