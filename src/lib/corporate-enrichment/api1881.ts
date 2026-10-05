import "server-only";
import crypto from "node:crypto";

const CURRENT_API_BASE = (process.env.API1881_BASE_URL || "https://services.api1881.no").replace(/\/+$/, "");
const LEGACY_API_BASE = "https://api.1881.no/search/v1";

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

function modernHeaders(): Record<string, string> {
  const key = modernSubscriptionKey();
  if (!key) throw new Error("API1881_NOT_CONFIGURED");
  return {
    Accept: "application/json",
    "Cache-Control": "no-cache",
    "Ocp-Apim-Subscription-Key": key,
  };
}

function legacyHeaders(): Record<string, string> {
  const legacy = legacyCredentials();
  if (!legacy) throw new Error("API1881_NOT_CONFIGURED");
  return {
    Accept: "application/json",
    "X-VK1881-API-CLIENT": legacy.clientId,
    Authorization: createJwt(legacy.identity, legacy.secret),
  };
}

async function readBody(response: Response) {
  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText.slice(0, 5000) };
  }
}

async function request1881(url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const body = await readBody(response);

  if (!response.ok) {
    const error = new Error(`API1881_HTTP_${response.status}`);
    (error as Error & { status?: number; body?: unknown; endpoint?: string }).status = response.status;
    (error as Error & { status?: number; body?: unknown; endpoint?: string }).body = body;
    (error as Error & { status?: number; body?: unknown; endpoint?: string }).endpoint = url;
    throw error;
  }

  return body;
}

async function modernGet(path: string) {
  return request1881(`${CURRENT_API_BASE}${path}`, modernHeaders());
}

async function legacyGet(path: string) {
  return request1881(`${LEGACY_API_BASE}${path}`, legacyHeaders());
}

export async function search1881Company(query: string) {
  const normalized = query.trim().slice(0, 180);
  if (!normalized) throw new Error("API1881_QUERY_REQUIRED");

  if (api1881AuthMode() === "subscription_key") {
    const organizationNumber = normalized.replace(/\D/g, "");
    if (/^\d{9}$/.test(organizationNumber)) {
      return modernGet(`/lookup/organizationnumber/${encodeURIComponent(organizationNumber)}`);
    }

    return modernGet(`/search/unit?query=${encodeURIComponent(normalized)}`);
  }

  return legacyGet(`/company/?querystring=${encodeURIComponent(normalized)}`);
}

export async function lookup1881Phone(number: string) {
  const normalized = number.replace(/[^0-9+]/g, "").slice(0, 24);
  if (!normalized) throw new Error("API1881_PHONE_REQUIRED");

  if (api1881AuthMode() === "subscription_key") {
    return modernGet(`/lookup/phonenumber/${encodeURIComponent(normalized)}`);
  }

  return legacyGet(`/phonenumber/${encodeURIComponent(normalized)}`);
}

export const API1881_SOURCE = {
  provider: "api1881",
  baseUrl: CURRENT_API_BASE,
  currentContractSource: "services.api1881.no current subscription-key API",
  legacyContractSource: "opp1881/public-api-test JWT fallback",
  automaticPersonCreation: false,
  automaticOutreach: false,
} as const;
