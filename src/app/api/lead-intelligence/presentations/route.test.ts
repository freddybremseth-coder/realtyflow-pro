import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { resetLeadIntelligenceRateLimitsForTests } from "@/services/lead-intelligence/api-guards";
import {
  LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV,
} from "@/services/lead-intelligence/persistence";
import {
  LEAD_INTELLIGENCE_DATABASE_CA_CERT_ENV,
  LEAD_INTELLIGENCE_DATABASE_URL_ENV,
} from "@/services/lead-intelligence/server-runtime";
import { GET, POST } from "./route";

const VALID_CORRELATION_ID = "rf_mqpres_0123456789abcdef01234567";
const buyerProfileId = "11111111-1111-4111-8111-111111111111";
const shortlistId = "22222222-2222-4222-8222-222222222222";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://realtyflow.test/api/lead-intelligence/presentations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function lookupRequest(search: string, headers: Record<string, string> = {}) {
  return new NextRequest(`https://realtyflow.test/api/lead-intelligence/presentations${search}`, {
    method: "GET",
    headers: {
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    brand: "soleada",
    buyerProfileId,
    shortlistId,
    title: "Moraira presentation",
    idempotencySeed: VALID_CORRELATION_ID,
    ...overrides,
  };
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

test("presentation draft rejects unauthenticated requests before feature flags", async () => {
  const response = await POST(request(validBody()) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("presentation draft requires property matching flag after auth and persistence", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await POST(request(validBody(), { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "PROPERTY_MATCHING_DISABLED");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("presentation draft validates request before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED = "true";

  const response = await POST(
    request(
      {
        brand: "neuralbeat",
        buyerProfileId,
        shortlistId,
      },
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("presentation draft lookup validates request before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED = "true";

  const response = await GET(
    lookupRequest("?brand=soleada&presentationId=not-a-uuid", { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("presentation draft lookup reports schema-not-ready safely without raw connection details", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED = "true";
  process.env.VERCEL_ENV = "production";

  const response = await GET(
    lookupRequest("?brand=soleada&presentationId=77777777-7777-4777-8777-777777777777", {
      cookie: await adminCookie(),
    }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("presentation draft reports schema-not-ready safely without raw connection details", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED = "true";
  process.env.VERCEL_ENV = "production";

  const response = await POST(request(validBody(), { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("presentation draft rate limits before persistence database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env.REALTYFLOW_PROPERTY_MATCHING_ENABLED = "true";
  const cookie = await adminCookie();
  let response: Response | undefined;

  for (let index = 0; index < 9; index += 1) {
    response = await POST(request(validBody(), { cookie }) as any);
  }
  const body = await response!.json();

  assert.equal(response!.status, 429);
  assert.equal(body.error.code, "RATE_LIMITED");
});
