import assert from "node:assert/strict";
import test from "node:test";
import {
  BuyerProfileSchema,
  CustomerMessageDraftSchema,
  ExtractedLeadSchema,
  LEAD_INTELLIGENCE_LIMITS,
  NormalizedPropertyForMatchingSchema,
  PropertyMatchSchema,
  inspectPhoneForLeadLookup,
  normalizeCriterionKey,
  normalizeCurrencyCode,
  normalizePropertyType,
  normalizePhoneForLeadLookup,
} from "./contracts";

const emmadaleExtractedLead = {
  contact: {
    name: "Emmadale",
    phone: "+47 90 17 47 14",
    email: null,
    language: "no",
    country: "NO",
  },
  purchaseReadiness: {
    level: "ready_to_buy",
    confidence: 0.9,
    reasoning: "Kunden er kjopeklar dersom riktig objekt dukker opp.",
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
    },
    {
      key: "floor_position",
      operator: "eq",
      value: "top_floor",
      sourceText: "Maa vaere paa toppen.",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
    {
      key: "has_lift",
      operator: "eq",
      value: true,
      sourceText: "Maa vaere heis om det er opp i etasjene.",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
  ],
  preferences: [
    {
      key: "terrace_area_m2",
      operator: "gte",
      weight: 0.85,
      value: { min: 20 },
      sourceText: "Stor aapen terrasse eventuelt ut fra stue 20 kvm+",
      appliesToPropertyTypes: ["apartment", "penthouse"],
    },
    {
      key: "view_quality",
      operator: "eq",
      weight: 0.8,
      value: "good",
      sourceText: "God utsikt.",
    },
  ],
  exclusions: [
    {
      key: "future_building_risk",
      operator: "eq",
      severity: "reject",
      value: "municipal_or_undeveloped_adjacent_plot",
      sourceText: "Kommunale tomten paa siden som kan bygges paa i fremtiden.",
    },
    {
      key: "view_privacy_loss_risk",
      operator: "eq",
      severity: "major_penalty",
      value: true,
      sourceText: "Kan bygges paa i fremtiden.",
    },
  ],
  missingInformation: [
    { key: "other", otherKey: "financing", question: "Er kjoepet kontant eller finansiert?", priority: "high" },
    { key: "total_budget", question: "Er 440 000 EUR en absolutt totalgrense?", priority: "high" },
    { key: "parking", question: "Er parkering et krav?", priority: "medium" },
    { key: "pool", question: "Oensker kunden basseng?", priority: "medium" },
    { key: "orientation", question: "Er solretning viktig?", priority: "low" },
  ],
  summary:
    "Kunden er fleksibel paa omraade og vurderer enderekkehus eller toppleilighet med utsikt, stor terrasse og minst to soverom.",
  suggestedNextAction:
    "Freddy boer godkjenne leadprofilen, avklare budsjettgrense og verifisere nabotomt-/utsiktsrisiko for aktuelle boliger.",
};

test("Emmadale expected extracted lead fixture satisfies the contract", () => {
  const parsed = ExtractedLeadSchema.parse(emmadaleExtractedLead);

  assert.equal(parsed.contact.name, "Emmadale");
  assert.equal(parsed.contact.email, null);
  assert.equal(parsed.purchaseReadiness.level, "ready_to_buy");
  assert.equal(parsed.budget.amount, 440000);
  assert.equal(parsed.budget.includesCosts, true);
  assert.equal(parsed.locations.flexible, true);
  assert.equal(parsed.hardRequirements.some((row) => row.key === "floor_position"), true);
  assert.equal(parsed.exclusions.some((row) => row.key === "future_building_risk"), true);
});

test("normalizes phone numbers for duplicate lookup without inventing contact data", () => {
  assert.equal(normalizePhoneForLeadLookup("+47 90 17 47 14"), "+4790174714");
  assert.equal(normalizePhoneForLeadLookup("0047 90 17 47 14"), "+4790174714");
  assert.equal(normalizePhoneForLeadLookup(null), null);
});

test("distinguishes lookup normalization from verified E.164 phone numbers", () => {
  const e164 = inspectPhoneForLeadLookup("+47 90 17 47 14");
  assert.equal(e164.normalizedLookup, "+4790174714");
  assert.equal(e164.e164, "+4790174714");
  assert.equal(e164.verifiedE164, true);
  assert.equal(e164.status, "verified_e164");

  const national = inspectPhoneForLeadLookup("90 17 47 14");
  assert.equal(national.normalizedLookup, "90174714");
  assert.equal(national.verifiedE164, false);
  assert.equal(national.e164, null);
  assert.equal(national.status, "national");
  assert.equal(national.reason, "missing_country_code");

  const tooShort = inspectPhoneForLeadLookup("12");
  assert.equal(tooShort.status, "invalid");
  assert.equal(tooShort.reason, "phone_length_out_of_bounds");

  const extension = inspectPhoneForLeadLookup("+47 90 17 47 14 ext 9");
  assert.equal(extension.status, "invalid");
  assert.equal(extension.normalizedLookup, null);
});

test("rejects invented or malformed email values", () => {
  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      contact: { ...emmadaleExtractedLead.contact, email: "unknown@example" },
    }),
  );
});

test("rejects oversized AI-controlled text and arrays", () => {
  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      summary: "x".repeat(LEAD_INTELLIGENCE_LIMITS.summary + 1),
    }),
  );

  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      propertyTypes: Array.from({ length: LEAD_INTELLIGENCE_LIMITS.propertyTypes + 1 }, () => "apartment"),
    }),
  );
});

test("uses canonical criteria and property type registries", () => {
  assert.equal(normalizeCriterionKey("bedroom_count"), "bedrooms");
  assert.equal(normalizeCriterionKey("number of bedrooms"), "bedrooms");
  assert.equal(normalizeCriterionKey("wine cellar"), "other");
  assert.equal(normalizePropertyType("End terrace"), "end_townhouse");
  assert.equal(normalizePropertyType("toppleilighet"), "penthouse");

  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      hardRequirements: [
        {
          key: "bedroom_count",
          operator: "gte",
          value: 2,
          sourceText: "Minst 2 soverom.",
        },
      ],
    }),
  );

  const parsed = ExtractedLeadSchema.parse({
    ...emmadaleExtractedLead,
    hardRequirements: [
      {
        key: "other",
        otherKey: "wine_cellar",
        operator: "eq",
        value: true,
        sourceText: "Kunden nevnte vinkjeller.",
      },
    ],
  });
  assert.equal(parsed.hardRequirements[0].key, "other");
});

test("normalizes currency, language, and country values", () => {
  const parsed = ExtractedLeadSchema.parse({
    ...emmadaleExtractedLead,
    contact: {
      ...emmadaleExtractedLead.contact,
      language: "NO",
      country: "Norway",
    },
    budget: {
      ...emmadaleExtractedLead.budget,
      currency: "euro",
    },
  });

  assert.equal(parsed.contact.language, "no");
  assert.equal(parsed.contact.country, "NO");
  assert.equal(parsed.budget.currency, "EUR");
  assert.equal(normalizeCurrencyCode("EURO"), "EUR");
});

test("normalizes common model language aliases without widening schema", () => {
  const aliases = [
    "Norwegian Bokmål",
    "Norwegian Bokmal",
    "bokmål",
    "nor",
    "nb_NO",
    "NO (inferred from phone)",
  ];

  for (const language of aliases) {
    const parsed = ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      contact: {
        ...emmadaleExtractedLead.contact,
        language,
      },
    });
    assert.equal(parsed.contact.language, "no");
  }

  assert.throws(() =>
    ExtractedLeadSchema.parse({
      ...emmadaleExtractedLead,
      contact: {
        ...emmadaleExtractedLead.contact,
        language: "customer language probably Scandinavian",
      },
    }),
  );
});

test("requires unknown property facts to stay explicit in matching inputs", () => {
  const property = NormalizedPropertyForMatchingSchema.parse({
    propertyId: "property-1",
    brandId: "soleada",
    facts: {
      has_lift: {
        value: null,
        verificationStatus: "unknown",
        sourceField: null,
        source: null,
        verifiedAt: null,
      },
      bedrooms: {
        value: 2,
        verificationStatus: "verified",
        sourceField: "properties.bedrooms",
        source: "public.properties",
        verifiedAt: "2026-06-12T00:00:00.000Z",
      },
    },
    dataQualityScore: 55,
    updatedAt: null,
  });

  assert.equal(property.facts.has_lift.verificationStatus, "unknown");
});

test("enforces cross-field invariants for property fact verification", () => {
  assert.throws(() =>
    NormalizedPropertyForMatchingSchema.parse({
      propertyId: "property-1",
      brandId: "soleada",
      facts: {
        bedrooms: {
          value: 2,
          verificationStatus: "verified",
          sourceField: "properties.bedrooms",
          source: "public.properties",
          verifiedAt: null,
        },
      },
      dataQualityScore: 55,
      updatedAt: null,
    }),
  );

  assert.throws(() =>
    NormalizedPropertyForMatchingSchema.parse({
      propertyId: "property-1",
      brandId: "soleada",
      facts: {
        has_lift: {
          value: null,
          verificationStatus: "unknown",
          sourceField: null,
          source: null,
          verifiedAt: "2026-06-12T00:00:00.000Z",
        },
      },
      dataQualityScore: 55,
      updatedAt: null,
    }),
  );
});

test("match results encode hard requirement failures deterministically", () => {
  const match = PropertyMatchSchema.parse({
    propertyId: "property-1",
    buyerProfileId: "profile-1",
    score: 34,
    eligibility: "rejected",
    hardRequirementResults: [
      {
        key: "has_lift",
        outcome: "unknown",
        expected: true,
        actual: null,
        sourceField: null,
        reason: "Heis er ukjent og kan ikke behandles som oppfylt.",
      },
    ],
    preferenceResults: [],
    exclusionResults: [
      {
        key: "future_building_risk",
        outcome: "fail",
        expected: "no_future_building_risk",
        actual: "unknown",
        sourceField: null,
        reason: "Nabotomt maa kontrolleres foer presentasjon.",
      },
    ],
    budgetResult: {
      key: "estimated_total_cost",
      outcome: "pass",
      expected: { max: 440000, currency: "EUR" },
      actual: 430000,
      sourceField: "calculated.estimated_total_cost",
      reason: "Estimert totalramme er innenfor kundens oppgitte budsjett.",
    },
    dataQualityScore: 45,
    verifiedFacts: ["bedrooms"],
    unverifiedFacts: ["has_lift", "future_building_risk"],
    reasonsForMatch: ["Minst to soverom."],
    concerns: ["Heis og nabotomt er ikke verifisert."],
    questionsToVerify: ["Har bygget heis?", "Finnes fremtidig byggerisiko foran utsikt?"],
  });

  assert.equal(match.eligibility, "rejected");
  assert.equal(match.hardRequirementResults[0].outcome, "unknown");
});

test("message drafts are drafts by default and do not imply automatic sending", () => {
  const draft = CustomerMessageDraftSchema.parse({
    leadId: "lead-1",
    contactId: "contact-1",
    brand: "soleada",
    channel: "email",
    subject: "Boliger som kan passe",
    bodyText: "Hei Emmadale, her er et utkast Freddy maa godkjenne.",
    bodyHtml: null,
    propertyIds: ["property-1"],
    profileVersion: 1,
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
  });

  assert.equal(draft.status, "draft");
  assert.equal(draft.sentAt, null);
});

test("enforces approval and send invariants for customer message drafts", () => {
  const baseDraft = {
    leadId: "lead-1",
    contactId: "contact-1",
    brand: "soleada",
    channel: "email",
    subject: "Boliger som kan passe",
    bodyText: "Hei Emmadale, her er et utkast Freddy maa godkjenne.",
    bodyHtml: null,
    propertyIds: ["property-1"],
    profileVersion: 1,
  };

  assert.throws(() =>
    CustomerMessageDraftSchema.parse({
      ...baseDraft,
      status: "sent",
      approvedBy: null,
      approvedAt: null,
      sentAt: "2026-06-12T00:00:00.000Z",
    }),
  );

  assert.throws(() =>
    CustomerMessageDraftSchema.parse({
      ...baseDraft,
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      sentAt: "2026-06-12T00:00:00.000Z",
    }),
  );

  assert.doesNotThrow(() =>
    CustomerMessageDraftSchema.parse({
      ...baseDraft,
      status: "sent",
      approvedBy: "freddy.bremseth@gmail.com",
      approvedAt: "2026-06-12T00:00:00.000Z",
      sentAt: "2026-06-12T00:05:00.000Z",
    }),
  );
});

test("requires item-level approval before approving a buyer profile", () => {
  const baseCriterion = {
    key: "bedrooms",
    operator: "gte",
    value: 2,
    source: "ai_suggestion",
    sourceText: "Minst 2 soverom.",
    confidence: 0.9,
    customerConfirmed: false,
    active: true,
    approvalStatus: "needs_review",
    createdBy: null,
    approvedBy: null,
    approvedAt: null,
  };

  assert.throws(() =>
    BuyerProfileSchema.parse({
      leadId: "lead-1",
      contactId: "contact-1",
      brand: "soleada",
      profileVersion: 1,
      status: "approved",
      requirements: [baseCriterion],
      preferences: [],
      exclusions: [],
      createdBy: "freddy.bremseth@gmail.com",
      updatedBy: "freddy.bremseth@gmail.com",
      approvedBy: "freddy.bremseth@gmail.com",
      approvedAt: "2026-06-12T00:00:00.000Z",
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
    }),
  );

  assert.doesNotThrow(() =>
    BuyerProfileSchema.parse({
      leadId: "lead-1",
      contactId: "contact-1",
      brand: "soleada",
      profileVersion: 1,
      status: "approved",
      requirements: [
        {
          ...baseCriterion,
          approvalStatus: "approved",
          approvedBy: "freddy.bremseth@gmail.com",
          approvedAt: "2026-06-12T00:00:00.000Z",
        },
      ],
      preferences: [],
      exclusions: [],
      createdBy: "freddy.bremseth@gmail.com",
      updatedBy: "freddy.bremseth@gmail.com",
      approvedBy: "freddy.bremseth@gmail.com",
      approvedAt: "2026-06-12T00:00:00.000Z",
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z",
    }),
  );
});
