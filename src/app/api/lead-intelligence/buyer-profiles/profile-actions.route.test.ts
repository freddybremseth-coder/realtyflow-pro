import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { resetLeadIntelligenceRateLimitsForTests } from "@/services/lead-intelligence/api-guards";
import { LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV } from "@/services/lead-intelligence/persistence";
import {
  LEAD_INTELLIGENCE_DATABASE_CA_CERT_ENV,
  LEAD_INTELLIGENCE_DATABASE_URL_ENV,
} from "@/services/lead-intelligence/server-runtime";
import { POST as archivePost } from "./[buyerProfileId]/archive/route";
import { POST as contactCandidatesPost } from "./[buyerProfileId]/contact-candidates/route";
import { POST as contactLinkPost } from "./[buyerProfileId]/contact-link/route";

const VALID_CORRELATION_ID = "rf_profile_0123456789abcdef012345";
const buyerProfileId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const params = Promise.resolve({ buyerProfileId });

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(`https://realtyflow.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test.beforeEach(() => {
  resetLeadIntelligenceRateLimitsForTests();
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_CONNECT_EXISTING_ENABLED;
  delete process.env[LEAD_INTELLIGENCE_DATABASE_URL_ENV];
  delete process.env[LEAD_INTELLIGENCE_DATABASE_CA_CERT_ENV];
  delete process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV];
  delete process.env.SUPABASE_DB_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_ENV;
});

test("saved profile actions reject unauthenticated requests before feature flags", async () => {
  const response = await archivePost(
    request(`/api/lead-intelligence/buyer-profiles/${buyerProfileId}/archive`, { brand: "soleada" }) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("saved profile actions report feature-disabled only for authenticated admin", async () => {
  const response = await archivePost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/archive`,
      { brand: "soleada" },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("saved profile candidate lookup rejects unknown brand before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await contactCandidatesPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/contact-candidates`,
      { brand: "neuralbeat" },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("saved profile contact linking requires dedicated feature flag before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await contactLinkPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/contact-link`,
      { brand: "soleada", contactId },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "CONTACT_LINKING_DISABLED");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("saved profile archive reports schema-not-ready safely without production DB URL", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.VERCEL_ENV = "production";

  const response = await archivePost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/archive`,
      { brand: "soleada" },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});
