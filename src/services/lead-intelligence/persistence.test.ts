import assert from "node:assert/strict";
import test from "node:test";
import {
  ContactLinkDecisionSchema,
  CreateBuyerProfileInputSchema,
  CreateLeadIntakeInputSchema,
  LEAD_CONTACT_LOOKUP_HASH_PREFIX,
  LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV,
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
const hmacSecret = "test-secret-with-at-least-thirty-two-bytes";

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
    [LEAD_CONTACT_LOOKUP_HMAC_SECRET_ENV]: hmacSecret,
  };
}

function adminAuth() {
  return { email: "freddy.bremseth@gmail.com", isAdmin: true };
}

function repository(db: QueryClient = new CaptureDb(), env = persistenceEnv()) {
  return new LeadIntelligencePersistenceRepository(db, {
    auth: adminAuth(),
    env,
  });
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

test("repository write boundary rejects before DB query when auth/admin/flag fail", async () => {
  const missingAuthDb = new CaptureDb();
  const missingAuthRepo = new LeadIntelligencePersistenceRepository(missingAuthDb, {
    auth: null,
    env: persistenceEnv(),
  });

  await assert.rejects(
    () =>
      missingAuthRepo.createIntake({
        brand: "soleada",
        source: "phone_call",
        rawTextRestricted: "Restricted raw note",
        rawTextRetentionUntil: null,
        language: "no",
        status: "draft",
        createdBy: "freddy.bremseth@gmail.com",
        correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
        idempotencyKey: "intake-key-001",
      }),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "AUTH_REQUIRED",
  );
  assert.equal(missingAuthDb.queries.length, 0);

  const nonAdminDb = new CaptureDb();
  const nonAdminRepo = new LeadIntelligencePersistenceRepository(nonAdminDb, {
    auth: { email: "agent@example.com", isAdmin: false },
    env: persistenceEnv(),
  });

  await assert.rejects(
    () =>
      nonAdminRepo.createIntake({
        brand: "soleada",
        source: "phone_call",
        rawTextRestricted: "Restricted raw note",
        language: "no",
        status: "draft",
        createdBy: "freddy.bremseth@gmail.com",
        correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
        idempotencyKey: "intake-key-002",
      }),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "ADMIN_FORBIDDEN",
  );
  assert.equal(nonAdminDb.queries.length, 0);

  const flagOffDb = new CaptureDb();
  const flagOffRepo = new LeadIntelligencePersistenceRepository(flagOffDb, {
    auth: adminAuth(),
    env: persistenceEnv(false),
  });

  await assert.rejects(
    () =>
      flagOffRepo.createIntake({
        brand: "soleada",
        source: "phone_call",
        rawTextRestricted: "Restricted raw note",
        language: "no",
        status: "draft",
        createdBy: "freddy.bremseth@gmail.com",
        correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
        idempotencyKey: "intake-key-003",
      }),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "LEAD_INTELLIGENCE_PERSISTENCE_DISABLED",
  );
  assert.equal(flagOffDb.queries.length, 0);
});

test("invalid intake and missing correlation ID are rejected before repository write", () => {
  const invalid = CreateLeadIntakeInputSchema.safeParse({
    brand: "soleada",
    source: "fax",
    rawTextRestricted: "short note",
    language: "no",
    status: "draft",
    createdBy: "freddy.bremseth@gmail.com",
    correlationId: "",
    idempotencyKey: "intake-key-invalid",
  });

  assert.equal(invalid.success, false);
});

test("unknown brand is rejected in persistence contracts", () => {
  const invalid = CreateLeadIntakeInputSchema.safeParse({
    brand: "neuralbeat",
    source: "phone_call",
    rawTextRestricted: "short note",
    language: "no",
    status: "draft",
    createdBy: "freddy.bremseth@gmail.com",
    correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
    idempotencyKey: "intake-key-brand",
  });

  assert.equal(invalid.success, false);
});

test("analysis run schema does not accept provider raw output", () => {
  const result = RecordLeadAnalysisRunInputSchema.safeParse({
    intakeId,
    idempotencyKey: "analysis-key-001",
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
  const repo = repository(db);

  await repo.createIntake({
    brand: "soleada",
    source: "phone_call",
    rawTextRestricted: "Restricted raw note",
    language: "no",
    status: "draft",
    createdBy: "freddy.bremseth@gmail.com",
    correlationId: "rf_mi7v4zk0_0123456789abcdef01234567",
    idempotencyKey: "intake-key-004",
  });

  await repo.recordAnalysisRun({
    intakeId,
    idempotencyKey: "analysis-key-002",
    promptVersion: "lead-intelligence-extraction-v1",
    model: "mock",
    resultJson: {
      schemaVersion: "lead-intelligence-review-save-v1",
      reviewPayloadHash: "sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      analysis: { summary: "safe validated DTO only" },
    },
    reviewPayloadHash: "sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    validationStatus: "valid",
    repaired: false,
    durationMs: 120,
    approved: false,
    approvedBy: null,
    approvedAt: null,
  });

  assert(db.queries[0].sql.includes("correlation_id"));
  assert(db.queries[0].sql.includes("raw_text_retention_until"));
  assert(db.queries[0].values?.includes("rf_mi7v4zk0_0123456789abcdef01234567"));
  assert.equal(db.queries[0].values?.[2], "Restricted raw note");
  assert.equal(db.queries[0].values?.[3], null);
  assert(db.queries[1].sql.includes("result_json ->> 'reviewPayloadHash' = $12"));
  assert.equal(
    db.queries[1].values?.at(-1),
    "sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  );
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

test("non-approved rows cannot keep approvedBy or approvedAt", () => {
  const analysis = RecordLeadAnalysisRunInputSchema.safeParse({
    intakeId,
    idempotencyKey: "analysis-key-003",
    promptVersion: "lead-intelligence-extraction-v1",
    model: "mock",
    resultJson: { ok: true },
    validationStatus: "valid",
    repaired: false,
    durationMs: 120,
    approved: false,
    approvedBy: "freddy.bremseth@gmail.com",
    approvedAt: null,
  });
  assert.equal(analysis.success, false);

  const profile = CreateBuyerProfileInputSchema.safeParse(
    profileInput({
      status: "draft",
      approvedBy: "freddy.bremseth@gmail.com",
      approvedAt: null,
      criteria: [approvedCriterion()],
    }),
  );
  assert.equal(profile.success, false);

  const criterion = CreateBuyerProfileInputSchema.safeParse(
    profileInput({
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      criteria: [
        approvedCriterion({
          approvalStatus: "pending",
          approvedBy: "freddy.bremseth@gmail.com",
          approvedAt: null,
        }),
      ],
    }),
  );
  assert.equal(criterion.success, false);
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
    { hmacSecret },
  );

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].contactId, contactId);
  assert.equal(candidates[0].matchType, "exact_phone");
  assert(!candidates[0].maskedPhone?.includes("90174714"));
  assert(!candidates[0].maskedEmail?.includes("kunde"));
  assert.equal(
    candidates[0].matchValueHash,
    hashLeadContactLookup({
      brand: "soleada",
      kind: "phone",
      value: "+4790174714",
      secret: hmacSecret,
    }),
  );
  assert(candidates[0].matchValueHash.startsWith(LEAD_CONTACT_LOOKUP_HASH_PREFIX));

  const db = new CaptureDb();
  const repo = repository(db);
  await repo.recordContactCandidates([
    {
      brand: "soleada",
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
    { hmacSecret },
  );
  assert.equal(exactEmail[0].matchType, "exact_email");
  assert.equal(exactEmail[0].confidence, 0.95);

  const nameOnly = findLeadContactCandidatePreviews(
    { brand: "soleada", name: "Emmadale" },
    [{ contactId, brand: "soleada", name: "Emmadale" }],
    { hmacSecret },
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
    { hmacSecret },
  );

  assert.equal(candidates.length, 2);
  assert.equal(requiresManualContactSelection(candidates), true);
  assert(!candidates.some((candidate) => candidate.contactId === "55555555-5555-4555-8555-555555555555"));
});

test("HMAC lookup hash is stable per secret and changes with a different secret", () => {
  const first = hashLeadContactLookup({
    brand: "soleada",
    kind: "email",
    value: "kunde@example.com",
    secret: hmacSecret,
  });
  const second = hashLeadContactLookup({
    brand: "soleada",
    kind: "email",
    value: "kunde@example.com",
    secret: hmacSecret,
  });
  const rotated = hashLeadContactLookup({
    brand: "soleada",
    kind: "email",
    value: "kunde@example.com",
    secret: "another-test-secret-with-enough-length",
  });

  assert.equal(first, second);
  assert.notEqual(first, rotated);
  assert(first.startsWith(LEAD_CONTACT_LOOKUP_HASH_PREFIX));
});

test("HMAC lookup hash fails closed without dedicated secret", () => {
  assert.throws(
    () =>
      findLeadContactCandidatePreviews(
        { brand: "soleada", email: "kunde@example.com" },
        [{ contactId, brand: "soleada", name: "Kunde", email: "kunde@example.com" }],
        { hmacSecret: "" },
      ),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "LOOKUP_HASH_SECRET_MISSING",
  );
});

test("cross-brand contact candidate batch is rejected before DB query", async () => {
  const db = new CaptureDb();
  const repo = repository(db);

  await assert.rejects(
    () =>
      repo.recordContactCandidates([
        {
          brand: "soleada",
          intakeId,
          contactId,
          matchType: "exact_phone",
          matchValueHash: hashLeadContactLookup({
            brand: "soleada",
            kind: "phone",
            value: "+4790174714",
            secret: hmacSecret,
          }),
          score: 0.98,
          reasons: ["exact phone"],
          status: "suggested",
        },
        {
          brand: "zeneco",
          intakeId,
          contactId: "44444444-4444-4444-8444-444444444444",
          matchType: "name_similarity",
          matchValueHash: hashLeadContactLookup({
            brand: "zeneco",
            kind: "name",
            value: "emmadale",
            secret: hmacSecret,
          }),
          score: 0.35,
          reasons: ["name"],
          status: "suggested",
        },
      ]),
    (error) =>
      error instanceof LeadIntelligencePersistenceError &&
      error.code === "INVALID_REQUEST",
  );
  assert.equal(db.queries.length, 0);
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
  const repo = repository(db);

  await repo.createBuyerProfile(profileInput());

  const allSql = db.queries.map((query) => query.sql).join("\n");
  assert(!/send|email_draft|property_match|shortlist/i.test(allSql));
});

test("createBuyerProfile uses one atomic SQL statement for profile and criteria", async () => {
  const db = new CaptureDb();
  const repo = repository(db);

  const result = await repo.createBuyerProfile(
    profileInput({
      criteria: [
        approvedCriterion({ key: "bedrooms", value: 2 }),
        approvedCriterion({ key: "has_lift", value: true, operator: "eq" }),
        approvedCriterion({ key: "floor_position", value: "top_floor", operator: "eq" }),
      ],
    }),
  );

  assert.equal(result.id, intakeId);
  assert.equal(db.queries.length, 1);
  assert(db.queries[0].sql.includes("with existing_profile as"));
  assert(db.queries[0].sql.includes("on conflict (intake_id, version) do nothing"));
  assert(db.queries[0].sql.includes("where selected_profile.duplicate is false"));
  assert(db.queries[0].sql.includes("inserted_criteria as"));
});

test("invalid criterion in profile prevents any DB query and cannot create partial profile", async () => {
  const db = new CaptureDb();
  const repo = repository(db);

  await assert.rejects(() =>
    repo.createBuyerProfile(
      profileInput({
        criteria: [
          approvedCriterion(),
          approvedCriterion({
            criterionType: "preference",
            weight: null,
            key: "terrace_area_m2",
          }),
          approvedCriterion(),
        ],
      }),
    ),
  );
  assert.equal(db.queries.length, 0);
});

test("recordContactCandidates is idempotent through a single upsert batch", async () => {
  const db = new CaptureDb();
  const repo = repository(db);
  await repo.recordContactCandidates([
    {
      brand: "soleada",
      intakeId,
      contactId,
      matchType: "exact_phone",
      matchValueHash: hashLeadContactLookup({
        brand: "soleada",
        kind: "phone",
        value: "+4790174714",
        secret: hmacSecret,
      }),
      score: 0.98,
      reasons: ["exact phone"],
      status: "suggested",
    },
  ]);

  assert.equal(db.queries.length, 1);
  assert(db.queries[0].sql.includes("on conflict (intake_id, match_type, match_value_hash)"));
  assert(db.queries[0].sql.includes("do update set"));
});
