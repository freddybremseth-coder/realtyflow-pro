import "server-only";
import crypto from "node:crypto";

const API_BASE = process.env.API1881_BASE_URL || "https://api.1881.no/search/v1";

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

function modernSubscriptionKey() {
  return (
    process.env.API1881_SUBSCRIPTION_KEY ||
    process.env.API_1881_SECRET ||
    ""
  ).trim();
}

function legacyCredentials() {
  const clientId = (process.env.API1881_CLIENT_ID || "").trim();
  const identity = (process.env.API1881_IDENTITY || "").trim();
  const secret = (process.env.API1881_SECRET || "").trim();
  return clientId && identity && secret ? { clientId, identity, secret } : null;
}

export function api1881AuthMode(): "subscription_key" | "legacy_jwt" | "unconfigured" {
  if (modernSubscriptionKey()) return "subscription_key";
  if (legacyCredentials()) return "legacy_jwt";
  return "unconfigured";
}

export function api1881Configured() {
  return api1881AuthMode() !== "unconfigured";
}

function authHeaders(): Record<string, string> {
  const key = modernSubscriptionKey();
  if (key) {
    return {
      // Current api1881.no profile exposes Primary/Secondary API keys as a
      // subscription key. API_1881_SECRET is accepted as a compatibility alias
      // for the user's existing Vercel setup.
      "Ocp-Apim-Subscription-Key": key,
    };
  }

  const legacy = legacyCredentials();
  if (legacy) {
    return {
      "X-VK1881-API-CLIENT": legacy.clientId,
      Authorization: createJwt(legacy.identity, legacy.secret),
    };
  }

  throw new Error("API1881_NOT_CONFIGURED");
}

async function api1881Fetch(path: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  const responseText = await response.text();
  let body: unknown = null;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = { raw: responseText.slice(0, 5000) };
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
  contractSource: "api1881.no current subscription key + legacy public-api-test fallback",
  automaticPersonCreation: false,
  automaticOutreach: false,
} as const;
