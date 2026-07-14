/**
 * DemoSites seller portal — auth primitives and CORS.
 *
 * chatgenius.pro is the public frontend (sellers + customers); RealtyFlow is
 * the backend and the ONLY place accounts are managed. The portal therefore
 * needs three small building blocks:
 *
 *   - scrypt password hashing (no external deps)
 *   - stateless signed tokens (HMAC-SHA256 over REALTYFLOW_SESSION_SECRET)
 *     so chatgenius.pro can hold a session without a sessions table
 *   - a strict CORS allowlist for the chatgenius.pro origins
 */

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const PORTAL_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PORTAL_ALLOWED_ORIGINS = new Set([
  "https://www.chatgenius.pro",
  "https://chatgenius.pro",
]);

function getPortalSecret(): string {
  const secret = process.env.REALTYFLOW_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("REALTYFLOW_SESSION_SECRET must be configured for the DemoSites portal.");
  }
  return secret;
}

// ─── Passwords ───────────────────────────────────────────────────────────────

export function hashPortalPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `s2$${salt}$${hash}`;
}

export function verifyPortalPassword(password: string, stored: string): boolean {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "s2") return false;
  try {
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(password, parts[1], 32);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

export type PortalTokenPayload = {
  email: string;
  name: string;
  role: "seller";
  exp: number;
};

function signPayload(payload: string): string {
  return createHmac("sha256", getPortalSecret()).update(payload).digest("base64url");
}

export function createPortalToken(user: { email: string; name: string }): { token: string; expiresAt: string } {
  const payload: PortalTokenPayload = {
    email: user.email.toLowerCase(),
    name: user.name,
    role: "seller",
    exp: Date.now() + PORTAL_TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${signPayload(encoded)}`,
    expiresAt: new Date(payload.exp).toISOString(),
  };
}

export function verifyPortalToken(token: string | null | undefined): PortalTokenPayload | null {
  const raw = String(token || "").trim();
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  try {
    const expected = Buffer.from(signPayload(encoded));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PortalTokenPayload;
    if (!payload.email || payload.role !== "seller") return null;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function portalTokenFromRequest(request: Request): PortalTokenPayload | null {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return verifyPortalToken(match?.[1]);
}

// ─── CORS ────────────────────────────────────────────────────────────────────

export function portalCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!PORTAL_ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function portalJson(request: Request, body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: portalCorsHeaders(request) });
}

export function portalPreflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: portalCorsHeaders(request) }) as NextResponse;
}
