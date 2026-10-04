import "server-only";
import crypto from "node:crypto";

const API_BASE = "https://api.1881.no/search/v1";

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createJwt(identity: string, secret: string) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    VK1881Identity: identity,
    iss: "VK1881Issuer",
    aud: "VK1881Services",
    exp: now + 86400,
    nbf: now,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secret).update(unsigned).digest();
  return `JWT ${unsigned}.${base64url(signature)}`;
}

export function api1881Configured() {
  return Boolean(
    process.env.API1881_CLIENT_ID &&
    process.env.API1881_IDENTITY &&
    process.env.API1881_SECRET,
  );
}

async function api1881Fetch(path: string) {
  const clientId = process.env.API1881_CLIENT_ID || "";
  const identity = process.env.API1881_IDENTITY || "";
  const secret = process.env.API1881_SECRET || "";
  if (!clientId || !identity || !secret) {
    throw new Error("API1881_NOT_CONFIGURED");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      "X-VK1881-API-CLIENT": clientId,
      Authorization: createJwt(identity, secret),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 5000) };
  }

  if (!response.ok) {
    const error = new Error(`API1881_HTTP_${response.status}`);
    (error as Error & { status?: number; body?: unknown }).status = response.status;
    (error as Error & { status?: number; body?: unknown }).body = body;
    throw error;
  }

  return body;
}

export async function search1881Company(query: string) {
  const normalized = query.trim().slice(0, 180);
  if (!normalized) throw new Error("API1881_QUERY_REQUIRED");
  return api1881Fetch(`/company/?querystring=${encodeURIComponent(normalized)}`);
}

export async function lookup1881Phone(number: string) {
  const normalized = number.replace(/[^0-9+]/g, "").slice(0, 24);
  if (!normalized) throw new Error("API1881_PHONE_REQUIRED");
  return api1881Fetch(`/phonenumber/${encodeURIComponent(normalized)}`);
}

export const API1881_SOURCE = {
  provider: "api1881",
  baseUrl: API_BASE,
  contractSource: "opp1881/public-api-test",
  automaticPersonCreation: false,
  automaticOutreach: false,
} as const;
