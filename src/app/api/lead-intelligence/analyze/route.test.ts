import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createAdminSession } from "@/lib/admin-auth";
import { resetLeadIntelligenceRateLimitsForTests } from "@/services/lead-intelligence/api-guards";
import { POST } from "./route";
import { EMMADALE_FIXTURE } from "@/services/lead-intelligence/fixtures";
import {
  setLeadIntelligenceProviderForTests,
  type LeadIntelligenceProvider,
} from "@/services/lead-intelligence/extraction";

const VALID_CORRELATION_ID = "rf_mi7v4zk0_0123456789abcdef01234567";

function emmadaleProvider(): LeadIntelligenceProvider {
  return {
    async generate() {
      return {
        model: "mock-lead-model",
        text: JSON.stringify({
          contact: {
            name: "Emmadale",
            phone: "[PHONE_1]",
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
            {
              key: "floor_position",
              operator: "eq",
              value: "top_floor",
              sourceText: "Må være på toppen.",
              confidence: 0.95,
              appliesToPropertyTypes: ["apartment", "penthouse"],
            },
            {
              key: "has_lift",
              operator: "eq",
              value: true,
              sourceText: "Må være heis om det er opp i etasjene.",
              confidence: 0.9,
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
            {
              key: "view_quality",
              operator: "eq",
              value: "good",
              sourceText: "God utsikt.",
              confidence: 0.86,
              weight: 0.75,
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
            {
              key: "view_privacy_loss_risk",
              operator: "eq",
              value: true,
              sourceText: "kan bygges på i fremtiden",
              confidence: 0.78,
              severity: "major_penalty",
            },
          ],
          missingInformation: [
            { key: "availability_status", question: "Når ønsker kunden å kjøpe?", priority: "high" },
            { key: "purchase_price", question: "Er budsjettet en absolutt grense?", priority: "high" },
          ],
          summary: "Kjøpeklar kunde med fleksibelt område og budsjett ca. 440.000 EUR inkludert omkostninger.",
          suggestedNextAction: "Avklar finansiering, absolutt budsjettgrense, nybygg/brukt og parkering/basseng.",
        }),
      };
    },
  };
}

function trackingProvider() {
  let calls = 0;
  const provider: LeadIntelligenceProvider = {
    async generate(input) {
      calls += 1;
      return emmadaleProvider().generate(input);
    },
  };
  return {
    provider,
    getCalls() {
      return calls;
    },
  };
}

async function adminCookie(email = "freddy.bremseth@gmail.com") {
  return `realtyflow_admin=${await createAdminSession(email)}`;
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://realtyflow.test/api/lead-intelligence/analyze", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-correlation-id": VALID_CORRELATION_ID,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    source: "phone_call",
    brand: "soleada",
    rawText: EMMADALE_FIXTURE,
    language: "no",
    ...overrides,
  };
}

test.beforeEach(() => {
  process.env.REALTYFLOW_SESSION_SECRET = "test-session-secret";
  process.env.REALTYFLOW_ADMIN_EMAILS = "freddy.bremseth@gmail.com";
  process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED = "true";
  resetLeadIntelligenceRateLimitsForTests();
  setLeadIntelligenceProviderForTests(emmadaleProvider());
});

test.afterEach(() => {
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  setLeadIntelligenceProviderForTests(null);
  resetLeadIntelligenceRateLimitsForTests();
});

test("feature flag off rejects analysis safely", async () => {
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  const response = await POST(request(validBody(), { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.error.code, "LEAD_INTELLIGENCE_DISABLED");
});

test("unauthenticated request returns auth error before feature flag check", async () => {
  delete process.env.REALTYFLOW_LEAD_INTELLIGENCE_ENABLED;
  const response = await POST(request(validBody()) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
});

test("unauthenticated request is rejected with safe envelope", async () => {
  const response = await POST(request(validBody()) as any);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");
  assert.equal(body.error.correlationId, VALID_CORRELATION_ID);
});

test("valid real-estate brand is allowed and provider is called once", async () => {
  const tracker = trackingProvider();
  setLeadIntelligenceProviderForTests(tracker.provider);

  const response = await POST(request(validBody({ brand: "soleada" }), { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.result.contact.name, "Emmadale");
  assert.equal(tracker.getCalls(), 1);
});

test("unknown brand is rejected before provider call", async () => {
  const tracker = trackingProvider();
  setLeadIntelligenceProviderForTests(tracker.provider);

  const response = await POST(request(validBody({ brand: "unknown-brand" }), { cookie: await adminCookie() }) as any);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(tracker.getCalls(), 0);
});

test("manipulative brand string is rejected before provider call", async () => {
  const tracker = trackingProvider();
  setLeadIntelligenceProviderForTests(tracker.provider);

  const response = await POST(
    request(validBody({ brand: "soleada; DROP TABLE leads" }), { cookie: await adminCookie() }) as any,
  );
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.equal(tracker.getCalls(), 0);
});

test("invalid body, empty text, and too-long text are rejected", async () => {
  const cookie = await adminCookie();
  const invalid = await POST(request({ rawText: "missing required fields" }, { cookie }) as any);
  assert.equal(invalid.status, 400);

  const empty = await POST(request(validBody({ rawText: "" }), { cookie }) as any);
  assert.equal(empty.status, 400);

  const tooLong = await POST(request(validBody({ rawText: "x".repeat(12_001) }), { cookie }) as any);
  assert.equal(tooLong.status, 413);
});

test("valid analysis returns DTO metadata, correlation ID, and no raw provider output", async () => {
  const response = await POST(request(validBody(), { cookie: await adminCookie() }) as any);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-correlation-id"), VALID_CORRELATION_ID);
  assert.equal(body.correlationId, VALID_CORRELATION_ID);
  assert.equal(body.result.contact.name, "Emmadale");
  assert.equal(body.result.contact.email, null);
  assert.equal(body.result.budget.amount, 440000);
  assert.equal(body.result.locations.flexible, true);
  assert.equal(body.meta.promptVersion, "lead-intelligence-extraction-v1");
  assert.equal(body.meta.phoneNormalization.e164, "+4790174714");
  assert.equal(serialized.includes("provider raw"), false);
});

test("raw provider failures are hidden from API response", async () => {
  setLeadIntelligenceProviderForTests({
    async generate() {
      throw new Error("provider failed with sk_live_secret and full prompt");
    },
  });

  const response = await POST(request(validBody(), { cookie: await adminCookie() }) as any);
  const body = await response.json();
  const serialized = JSON.stringify(body);

  assert.equal(response.status, 502);
  assert.equal(body.error.code, "AI_PROVIDER_ERROR");
  assert.equal(serialized.includes("sk_live_secret"), false);
  assert.equal(serialized.includes(EMMADALE_FIXTURE.slice(0, 20)), false);
});

test("rate limit returns stable code", async () => {
  const cookie = await adminCookie();
  for (let index = 0; index < 8; index += 1) {
    const response = await POST(request(validBody(), { cookie }) as any);
    assert.equal(response.status, 200);
  }

  const limited = await POST(request(validBody(), { cookie }) as any);
  const body = await limited.json();
  assert.equal(limited.status, 429);
  assert.equal(body.error.code, "RATE_LIMITED");
});
