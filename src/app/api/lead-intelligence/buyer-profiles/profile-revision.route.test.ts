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
import { POST as revisionPost } from "./[buyerProfileId]/revision/route";

const VALID_CORRELATION_ID = "rf_revision_0123456789abcdef0123";
const buyerProfileId = "22222222-2222-4222-8222-222222222222";
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

const validRevisionBody = {
  brand: "soleada",
  summary: "Customer updated the budget and wants to continue matching from a revised profile.",
  purchaseReadiness: "hot",
  budgetAmount: 550000,
  budgetCurrency: "EUR",
  budgetIncludesCosts: false,
  budgetApproximate: true,
  locationFlexible: false,
  revisionNote: "Customer called and changed budget from 400000 to 550000.",
};

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

test("buyer profile revision rejects unauthenticated requests before feature flags", async () => {
  const response = await revisionPost(
    request(`/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision`, validRevisionBody) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("buyer profile revision reports feature-disabled only for authenticated admin", async () => {
  const response = await revisionPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision`,
      validRevisionBody,
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("buyer profile revision rejects unknown brand before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await revisionPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision`,
      { ...validRevisionBody, brand: "neuralbeat" },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("buyer profile revision validates editable fields before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await revisionPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision`,
      { ...validRevisionBody, summary: "", budgetAmount: -1 },
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("buyer profile revision reports schema-not-ready safely without production DB URL", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.VERCEL_ENV = "production";

  const response = await revisionPost(
    request(
      `/api/lead-intelligence/buyer-profiles/${buyerProfileId}/revision`,
      validRevisionBody,
      { cookie: await adminCookie() },
    ) as any,
    { params },
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});
