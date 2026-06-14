import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactLinkDecisionSchema,
  CreateBuyerProfileInputSchema,
  CreateLeadIntakeInputSchema,
  LeadIntelligencePersistenceError,
  LeadIntelligencePersistenceRepository,
  RecordLeadAnalysisRunInputSchema,
  assertExplicitContactDecision,
  assertLeadIntelligencePersistenceAccess,
  findLeadContactCandidatePreviews,
  hashLeadContactLookup,
  requiresManualContactSelection,
  type QueryClient,
} from "./persistence";

const intakeId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const approvedAt = "2026-06-14T12:00:00.000Z";

class CaptureDb implements QueryClient {
  queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];

  async query<T>(sql: string, values?: readonly unknown[]) {
    this.queries.push({ sql, values });
    return { rows: [{ id: this.queries.length === 1 ? intakeId : profileId }] as T[] };
  }
}

function persistenceEnv(enabled = true) {
  return {
    REALTYFLOW_LEAD_INTELLIGENCE_PERSISTENCE_ENABLED: enabled ? "true" : "false",
  };
}

function approvedCriterion(overrides: Record<string, unknown> = {}) {
  return {
    criterionType: "hard_requirement",
    key: "bedrooms",
    otherKey: null,
    operator: "gte",
    value: 2,
    weight: null,
    severity: null,
    appliesToPropertyTypes: ["apartment"],
    source: "ai_suggestion",
    sourceText: "Minst 2 soverom.",
    confidence: 0.9,
    customerConfirmed: false,
    approvalStatus: "approved",
    approvedBy: "freddy.bremseth@gmail.com",
    approvedAt,
    active: true,
    ...overrides,
  };
}

function profileInput(overrides: Record<string, unknown> = {}) {
  return {
    brand: "soleada",
    contactId: null,
    intakeId,
    version: 1,
    status: "approved",
    purchaseReadiness: "ready_to_buy",
    budgetAmount: 440000,
    budgetCurrency: "eur",
    budgetIncludesCosts: true,
    budgetApproximate: true,
    locationFlexible: true,
    summary: "Kjøpeklar kunde med fleksibelt område.",
    createdBy: "freddy.bremseth@gmail.com",
    approvedBy: "freddy.bremseth@gmail.com",
    approvedAt,
    criteria: [approvedCriterion()],
    ...overrides,
  };
}

test("persistence flag defaults to disabled and blocks writes", () => {
  assert.throws(
    () => assertLeadIntelligencePersistenceAccess({ email: "freddy.bremseth@gmail.com", isAdmin: true }, {}),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED" &&
      error.status === 403,
  );
});

test("unauthenticated and non-admin persistence writes are rejected", () => {
  assert.throws(
    () => assertLeadIntelligencePersistenceAccess(null, persistenceEnv()),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "AUTH_REQUIRED" &&
      error.status === 401,
  );

  assert.throws(
    () => assertLeadIntelligencePersistenceAccess({ email: "agent@example.com", isAdmin: false }, persistenceEnv()),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "ADMIN_FORBIDDEN" &&
      error.status === 403,
  );
});

test("invalid intake and missing correlation ID are rejected before repository write", () => {
  const invalid = CreateLeadIntakeInputSchema.safeParse({
    brand: "soleada",
    source: "fax",
    rawTextEncryptedOrRestricted: "short note",
    language: "no",
    status: "draft",
    createdBy: "freddy.bremseth@gmail.com",
    correlationId: "",
  });

  assert.equal(invalid.success, false);
});

test("analysis run schema does not accept provider raw output", () => {
  const result = RecordLeadAnalysisRunInputSchema.safeParse({
    intakeId,
    promptVersion: "lead-intelligence-extraction-v1",
    model: "mock",
    resultJson: { ok: true },
    validationStatus: "valid",
    repaired: false,
    durationMs: 120,
    approved: false,
    approvedBy: null,
    approvedAt: null,
    providerRawOutput: "{ raw: true }",
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert(result.error.issues.some((issue) => issue.code === "unrecognized_keys"));
  }
});

test("repository stores correlation ID and never writes provider raw output column", async () => {
  const db = new CaptureDb();
  const repo = new LeadIntelligencePersistenceRepository(db);

  await repo.createIntake({
    brand: "soleada",
    source: "phone_call",
    rawTextEncryptedOrRestricted: "Encrypted or restricted raw note",
    language: "no",
    status: "draft",
    createdBy: "freddy.bremseth@gmail.com",
    correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
  });

  await repo.recordAnalysisRun({
    intakeId,
    promptVersion: "lead-intelligence-extraction-v1",
    model: "mock",
    resultJson: { summary: "safe validated DTO only" },
    validationStatus: "valid",
    repaired: false,
    durationMs: 120,
    approved: false,
    approvedBy: null,
    approvedAt: null,
  });

  assert(db.queries[0].sql.includes("correlation_id"));
  assert(db.queries[0].values?.includes("rf_mi7v4zk0_0123456789abcdef01234567"));
  assert(!db.queries.some((query) => /provider_raw|raw_output/i.test(query.sql)));
});

test("approved profile requires item-level approval for every active criterion", () => {
  const result = CreateBuyerProfileInputSchema.safeParse(
    profileInput({
      criteria: [approvedCriterion({ approvalStatus: "pending", approvedBy: null, approvedAt: null })],
    }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert(
      result.error.issues.some((issue) =>
        issue.message.includes("active criteria must be individually approved"),
      ),
    );
  }
});

test("rejected criterion cannot remain active and approved criterion stores approver", () => {
  const rejected = CreateBuyerProfileInputSchema.safeParse(
    profileInput({
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      criteria: [
        approvedCriterion({
          approvalStatus: "rejected",
          approvedBy: null,
          approvedAt: null,
          active: true,
        }),
      ],
    }),
  );
  assert.equal(rejected.success, false);

  const approved = CreateBuyerProfileInputSchema.parse(profileInput());
  assert.equal(approved.criteria[0].approvalStatus, "approved");
  assert.equal(approved.criteria[0].approvedBy, "freddy.bremseth@gmail.com");
  assert.equal(approved.criteria[0].approvedAt, approvedAt);
});

test("budget currency normalizes before buyer profile persistence", () => {
  const parsed = CreateBuyerProfileInputSchema.parse(profileInput({ budgetCurrency: "€" }));
  assert.equal(parsed.budgetCurrency, "EUR");
});

test("existing contact candidate search masks PII and never overwrites contacts", async () => {
  const candidates = findLeadContactCandidatePreviews(
    {
      brand: "soleada",
      name: "Emmadale",
      phone: "+47 90 17 47 14",
      email: "kunde@example.com",
    },
    [
      {
        contactId,
        brand: "soleada",
        name: "Emmadale",
        phone: "+4790174714",
        email: "kunde@example.com",
      },
    ],
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].contactId, contactId);
  assert.equal(candidates[0].matchType, "exact_phone");
  assert(!candidates[0].maskedPhone?.includes("90174714"));
  assert(!candidates[0].maskedEmail?.includes("kunde"));
  assert.equal(candidates[0].matchValueHash, hashLeadContactLookup("phone", "+4790174714"));

  const db = new CaptureDb();
  const repo = new LeadIntelligencePersistenceRepository(db);
  await repo.recordContactCandidates([
    {
      intakeId,
      contactId,
      matchType: candidates[0].matchType,
      matchValueHash: candidates[0].matchValueHash,
      score: candidates[0].confidence,
      reasons: candidates[0].reasons,
      status: "suggested",
    },
  ]);

  assert(db.queries.every((query) => !/update\s+public\.contacts/i.test(query.sql)));
});

test("exact email candidate is found and name-only candidate stays weak/manual", () => {
  const exactEmail = findLeadContactCandidatePreviews(
    { brand: "soleada", email: "KUNDE@EXAMPLE.COM" },
    [{ contactId, brand: "soleada", name: "Kunde", email: "kunde@example.com" }],
  );
  assert.equal(exactEmail[0].matchType, "exact_email");
  assert.equal(exactEmail[0].confidence, 0.95);

  const nameOnly = findLeadContactCandidatePreviews(
    { brand: "soleada", name: "Emmadale" },
    [{ contactId, brand: "soleada", name: "Emmadale" }],
  );
  assert.equal(nameOnly[0].matchType, "name_similarity");
  assert.equal(nameOnly[0].confidence, 0.35);
  assert.equal(requiresManualContactSelection(nameOnly), true);
});

test("multiple candidates require manual selection and brand isolation is enforced", () => {
  const candidates = findLeadContactCandidatePreviews(
    { brand: "soleada", name: "Emmadale", phone: "+4790174714" },
    [
      { contactId, brand: "soleada", name: "Emmadale", phone: "+4790174714" },
      {
        contactId: "44444444-4444-4444-8444-444444444444",
        brand: "soleada",
        name: "Emmadale",
      },
      {
        contactId: "55555555-5555-4555-8555-555555555555",
        brand: "zeneco",
        name: "Emmadale",
        phone: "+4790174714",
      },
    ],
  );

  assert.equal(candidates.length, 2);
  assert.equal(requiresManualContactSelection(candidates), true);
  assert(!candidates.some((candidate) => candidate.contactId === "55555555-5555-4555-8555-555555555555"));
});

test("contact creation and linking require explicit user action", () => {
  assert.throws(
    () => assertExplicitContactDecision({ action: "create_new", contactId: null, explicitApproval: false }),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "CONTACT_DECISION_REQUIRES_EXPLICIT_ACTION",
  );

  const decision = ContactLinkDecisionSchema.parse({
    action: "connect_existing",
    contactId,
    explicitApproval: true,
  });
  assert.equal(decision.action, "connect_existing");
});

test("persistence layer has no email sending or property matching side effects", async () => {
  const db = new CaptureDb();
  const repo = new LeadIntelligencePersistenceRepository(db);

  await repo.createBuyerProfile(profileInput());

  const allSql = db.queries.map((query) => query.sql).join("\n");
  assert(!/send|email_draft|property_match|shortlist/i.test(allSql));
});
