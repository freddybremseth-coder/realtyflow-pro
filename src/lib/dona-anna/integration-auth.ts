import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const DONA_ANNA_INTEGRATION_CLIENTS = ["olivia", "storefront"] as const;
export type DonaAnnaIntegrationClient = (typeof DONA_ANNA_INTEGRATION_CLIENTS)[number];

function secretFor(client: DonaAnnaIntegrationClient) {
  return client === "olivia"
    ? String(process.env.DONA_ANNA_OLIVIA_API_SECRET || "").trim()
    : String(process.env.DONA_ANNA_STOREFRONT_API_SECRET || "").trim();
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isValidDonaAnnaIntegrationSecret(configured: string, supplied: string) {
  if (configured.length < 24 || !supplied) return false;
  return timingSafeEqual(digest(configured), digest(supplied));
}

export function authenticateDonaAnnaIntegration(request: NextRequest, client: DonaAnnaIntegrationClient) {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "").trim();
  const supplied = bearer || String(request.headers.get("x-dona-anna-key") || "").trim();
  const configured = secretFor(client);
  return {
    configured: configured.length >= 24,
    authenticated: isValidDonaAnnaIntegrationSecret(configured, supplied),
  };
}
