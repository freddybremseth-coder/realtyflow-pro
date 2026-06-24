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
import { GET } from "./route";

const VALID_CORRELATION_ID = "rf_mqwork_0123456789abcdef01234567";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(search = "", headers: Record<string, string> = {}) {
  return new NextRequest(`https://realtyflow.test/api/lead-intelligence/worklist${search}`, {
    method: "GET",
    headers: {
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
  });
}

test.beforeEach(() => {
  resetLeadIntelligenceRateLimitsForTests();
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED;
  delete process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED;
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

test("worklist rejects unauthenticated requests before feature flags", async () => {
  const response = await GET(request("?brand=soleada") as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("worklist reports feature-disabled only for authenticated admin", async () => {
  const response = await GET(request("?brand=soleada", { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("worklist requires persistence flag after auth and feature flag", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";

  const response = await GET(request("?brand=soleada", { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED");
});

test("worklist rejects unknown brands before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await GET(request("?brand=neuralbeat", { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("worklist rejects excessive limits before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await GET(request("?brand=soleada&limit=500", { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
});

test("worklist rejects invalid contact filters before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await GET(
    request("?brand=soleada&contactId=not-a-contact-id", { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("worklist reports schema-not-ready safely without raw connection details", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.VERCEL_ENV = "production";

  const response = await GET(request("?brand=soleada", { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});
