import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/reset-password",
  "/reset-password",
  "/api/properties",
  "/api/area-profiles",
  "/api/contacts",
  "/api/chatbot",
  "/api/health",
];

function isPublicPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  );
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

  if (isPublicPath(pathname)) return NextResponse.next();

  const isAllowed = await verifyToken(request.cookies.get("realtyflow_admin")?.value);
  if (isAllowed) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!.*\\..*).*)"],
};
