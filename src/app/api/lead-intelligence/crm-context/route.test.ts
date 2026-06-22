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
import { POST } from "./route";

const VALID_CORRELATION_ID = "rf_mqcrmctx_0123456789abcdef012345";

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://realtyflow.test/api/lead-intelligence/crm-context", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function contact() {
  return {
    name: "Emmadale",
    phone: "+4790174714",
    email: null,
    language: null,
    country: "NO",
  };
}

test.beforeEach(() => {
  resetLeadIntelligenceRateLimitsForTests();
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED;
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

test("CRM context rejects unauthenticated requests before feature flags", async () => {
  const response = await POST(request({ brand: "soleada", contact: contact() }) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("CRM context reports feature-disabled only for authenticated admin", async () => {
  const response = await POST(
    request({ brand: "soleada", contact: contact() }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("CRM context requires persistence flag before parsing succeeds into DB access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";

  const response = await POST(
    request({ brand: "soleada", contact: contact() }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED");
});

test("CRM context rejects unknown brands before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await POST(
    request({ brand: "not-a-real-brand", contact: contact() }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("CRM context rejects excessive contact id lists before database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await POST(
    request(
      {
        brand: "soleada",
        contact: contact(),
        contactIds: Array.from({ length: 11 }, (_, index) =>
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        ),
      },
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
});

test("CRM context reports schema-not-ready safely without connection details", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";
  process.env.VERCEL_ENV = "production";

  const response = await POST(
    request({ brand: "soleada", contact: contact() }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});
