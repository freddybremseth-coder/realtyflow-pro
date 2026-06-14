import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { POST as reviewPost } from "./route";
import { POST as candidatesPost } from "../contact-candidates/route";

const VALID_CORRELATION_ID = "rf_mi7v4zk0_0123456789abcdef01234567";

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
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED;
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL;
});

test("review route rejects unauthenticated requests before feature flag checks", async () => {
  const response = await reviewPost(
    request("/api/lead-intelligence/review", { brand: "soleada" }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("review route reports feature-disabled only for authenticated admin", async () => {
  const response = await reviewPost(
    request("/api/lead-intelligence/review", { brand: "soleada" }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("review route rejects writes when persistence flag is off before DB access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";

  const response = await reviewPost(
    request("/api/lead-intelligence/review", { brand: "soleada" }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED");
});

test("review route validates body before opening persistence database", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await reviewPost(
    request("/api/lead-intelligence/review", { brand: "not-a-real-brand" }, { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("contact candidates route rejects unauthenticated and persistence-disabled requests", async () => {
  const unauthenticated = await candidatesPost(
    request("/api/lead-intelligence/contact-candidates", { brand: "soleada", contact: {} }) as any,
  );
  const unauthenticatedBody = await unauthenticated.json();
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticatedBody.error.code, "AUTH_REQUIRED");

  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  const persistenceOff = await candidatesPost(
    request(
      "/api/lead-intelligence/contact-candidates",
      { brand: "soleada", contact: { name: "Emmadale", phone: "+4790174714", email: null, language: null, country: "NO" } },
      { cookie: await adminCookie() },
    ) as any,
  );
  const persistenceOffBody = await persistenceOff.json();
  assert.equal(persistenceOff.status, 403);
  assert.equal(persistenceOffBody.error.code, "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED");
});
