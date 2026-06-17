import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { POST as reviewPost } from "./route";
import { POST as candidatesPost } from "../contact-candidates/route";
import { resetLeadIntelligenceRateLimitsForTests } from "@/services/lead-intelligence/api-guards";
import {
  LeadIntelligenceReviewError,
  leadIntelligenceCriterionFingerprint,
} from "@/services/lead-intelligence/review";
import {
  LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV,
  type QueryClient,
} from "@/services/lead-intelligence/persistence";
import {
  findContactCandidatePreviewsWithDb,
  leadIntelligenceJsonError,
  verifySelectedContactCandidateWithDb,
} from "@/services/lead-intelligence/server-runtime";

const VALID_CORRELATION_ID = "rf_mi7v4zk0_0123456789abcdef01234567";
const contactId = "44444444-4444-4444-8444-444444444444";

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
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_DATABASE_URL;
  delete process.env.SUPABASE_DB_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.VERCEL_ENV;
  delete process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV];
});

function extractedLead() {
  return {
    contact: {
      name: "Emmadale",
      phone: "+4790174714",
      email: null,
      language: null,
      country: "NO",
    },
    purchaseReadiness: {
      level: "ready_to_buy",
      confidence: 0.9,
      reasoning: "Kunden er kjøpeklar om riktig objekt dukker opp.",
    },
    budget: {
      amount: 440000,
      currency: "EUR",
      includesCosts: true,
      approximate: true,
      hardLimit: null,
    },
    propertyTypes: ["end_townhouse", "apartment", "penthouse"],
    locations: {
      preferred: [],
      excluded: [],
      flexible: true,
    },
    hardRequirements: [
      {
        key: "bedrooms",
        operator: "gte",
        value: 2,
        sourceText: "Minst 2 soverom.",
        confidence: 0.95,
        appliesToPropertyTypes: ["apartment", "penthouse"],
      },
    ],
    preferences: [
      {
        key: "terrace_area_m2",
        operator: "gte",
        value: 20,
        sourceText: "Stor åpen terrasse eventuelt ut fra stue 20 kvm+",
        confidence: 0.9,
        weight: 0.8,
        appliesToPropertyTypes: ["apartment", "penthouse"],
      },
    ],
    exclusions: [
      {
        key: "future_building_risk",
        operator: "eq",
        value: true,
        sourceText: "kommunale tomten på siden som kan bygges på i fremtiden",
        confidence: 0.96,
        severity: "reject",
      },
    ],
    missingInformation: [
      {
        key: "availability_status",
        question: "Når ønsker kunden å kjøpe?",
        priority: "high",
      },
    ],
    summary: "Kjøpeklar kunde med fleksibelt område.",
    suggestedNextAction: "Avklar finansiering.",
  };
}

function validReviewBody(overrides: Record<string, unknown> = {}) {
  const analysis = extractedLead();
  return {
    brand: "soleada",
    source: "phone_call",
    rawText: "Restricted reviewed intake text",
    language: "no",
    analysis,
    analysisMeta: {
      model: "mock-lead-model",
      promptVersion: "lead-intelligence-extraction-v1",
      durationMs: 100,
      repaired: false,
    },
    contactDecision: {
      action: "continue_without_contact",
      contactId: null,
      explicitApproval: true,
    },
    reviewedCriteria: [
      {
        criterionType: "hard_requirement",
        fingerprint: leadIntelligenceCriterionFingerprint({
          criterionType: "hard_requirement",
          index: 0,
          item: analysis.hardRequirements[0],
        }),
        approvalStatus: "approved",
        customerConfirmed: true,
      },
      {
        criterionType: "preference",
        fingerprint: leadIntelligenceCriterionFingerprint({
          criterionType: "preference",
          index: 0,
          item: analysis.preferences[0],
        }),
        approvalStatus: "approved",
        customerConfirmed: false,
      },
      {
        criterionType: "exclusion",
        fingerprint: leadIntelligenceCriterionFingerprint({
          criterionType: "exclusion",
          index: 0,
          item: analysis.exclusions[0],
        }),
        approvalStatus: "approved",
        customerConfirmed: false,
      },
      {
        criterionType: "missing_information",
        fingerprint: leadIntelligenceCriterionFingerprint({
          criterionType: "missing_information",
          index: 0,
          item: analysis.missingInformation[0],
        }),
        approvalStatus: "rejected",
        customerConfirmed: false,
      },
    ],
    ...overrides,
  };
}

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

test("review route rejects forged client contact candidates before persistence", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";

  const response = await reviewPost(
    request(
      "/api/lead-intelligence/review",
      {
        ...validReviewBody(),
        contactCandidates: [
          {
            contactId,
            confidence: 1,
            matchValueHash: "hmac-sha256:v1:forged",
          },
        ],
      },
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(body).includes("hmac-sha256:v1:forged"), false);
});

test("review route requires dedicated persistence URL in production", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";
  process.env.VERCEL_ENV = "production";
  process.env.POSTGRES_URL = "postgres://broad-fallback-should-not-be-used";

  const response = await reviewPost(
    request(
      "/api/lead-intelligence/review",
      validReviewBody(),
      { cookie: await adminCookie() },
    ) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "PERSISTENCE_SCHEMA_NOT_READY");
  assert.equal(JSON.stringify(body).includes("postgres://"), false);
});

test("review route rate limits before persistence database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";
  const cookie = await adminCookie();
  let response: Response | undefined;

  for (let index = 0; index < 9; index += 1) {
    response = await reviewPost(
      request(
        "/api/lead-intelligence/review",
        validReviewBody(),
        { cookie },
      ) as any,
    );
  }
  const body = await response!.json();

  assert.equal(response!.status, 429);
  assert.equal(body.error.code, "RATE_LIMITED");
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

test("contact candidates route rate limits before persistence database access", async () => {
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED = "true";
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";
  const cookie = await adminCookie();
  let response: Response | undefined;

  for (let index = 0; index < 9; index += 1) {
    response = await candidatesPost(
      request(
        "/api/lead-intelligence/contact-candidates",
        { brand: "soleada", contact: { name: "Emmadale", phone: "+4790174714", email: null, language: null, country: "NO" } },
        { cookie },
      ) as any,
    );
  }
  const body = await response!.json();

  assert.equal(response!.status, 429);
  assert.equal(body.error.code, "RATE_LIMITED");
});

test("server-side contact verification rejects deleted, cross-brand, and stale contacts", async () => {
  class ContactDb implements QueryClient {
    constructor(private readonly row: Record<string, unknown> | null) {}
    async query<T>() {
      return { rows: (this.row ? [this.row] : []) as T[] };
    }
  }
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";

  await assert.rejects(
    () =>
      verifySelectedContactCandidateWithDb(new ContactDb(null), {
        brand: "soleada",
        contactId,
        contact: { name: "Emmadale", phone: "+4790174714", email: null, country: "NO" },
      }),
    /Selected contact no longer exists/,
  );

  await assert.rejects(
    () =>
      verifySelectedContactCandidateWithDb(
        new ContactDb({ contactId, brand: "zeneco", name: "Emmadale", phone: "+4790174714", email: null }),
        {
          brand: "soleada",
          contactId,
          contact: { name: "Emmadale", phone: "+4790174714", email: null, country: "NO" },
        },
      ),
    /belongs to another brand/,
  );

  await assert.rejects(
    () =>
      verifySelectedContactCandidateWithDb(
        new ContactDb({ contactId, brand: "soleada", name: "Another", phone: "+34999999999", email: null }),
        {
          brand: "soleada",
          contactId,
          contact: { name: "Emmadale", phone: "+4790174714", email: null, country: "NO" },
        },
      ),
    /no longer matches/,
  );
});

test("server-side contact lookup uses restricted view and rejects invalid brand before query", async () => {
  class CaptureContactDb implements QueryClient {
    queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
    async query<T>(sql: string, values?: readonly unknown[]) {
      this.queries.push({ sql, values });
      return {
        rows: [
          {
            contactId,
            brand: "soleada",
            name: "Emmadale",
            phone: "+4790174714",
            email: null,
          },
        ] as T[],
      };
    }
  }
  process.env[LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV] = "test-secret-with-at-least-thirty-two-bytes";

  const db = new CaptureContactDb();
  const candidates = await findContactCandidatePreviewsWithDb(db, {
    brand: "soleada",
    contact: { name: "Emmadale", phone: "+4790174714", email: null, country: "NO" },
  });

  assert.equal(candidates.length, 1);
  assert.equal(db.queries.length, 1);
  assert.equal(db.queries[0].sql.includes("public.lead_intelligence_contact_lookup"), true);
  assert.equal(db.queries[0].sql.includes("from public.contacts"), false);

  const invalidBrandDb = new CaptureContactDb();
  await assert.rejects(
    () =>
      findContactCandidatePreviewsWithDb(invalidBrandDb, {
        brand: "not-a-real-brand",
        contact: { name: "Emmadale", phone: "+4790174714", email: null, country: "NO" },
      }),
    /Lead Intelligence brand is not allowed/,
  );
  assert.equal(invalidBrandDb.queries.length, 0);
});

test("review conflict uses safe error envelope with correlation ID", async () => {
  const response = leadIntelligenceJsonError(
    new LeadIntelligenceReviewError(
      "REVIEW_CONFLICT",
      "This review idempotency seed was already used for a different reviewed payload",
      409,
      { conflict: true },
    ),
    VALID_CORRELATION_ID,
  );
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error.code, "REVIEW_CONFLICT");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
  assert.equal(body.error.details.conflict, true);
});
