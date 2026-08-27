import { criterionReviewFingerprint } from "@/services/lead-intelligence/review-shared";
import { ExtractedLeadSchema, normalizePropertyType } from "@/services/lead-intelligence/contracts";

export interface BuyerIntakeReviewContact {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  pipelineStatus?: string | null;
  pipelineValue?: number | null;
}

export interface BuyerIntakeMetadata {
  form_type?: string | null;
  extraction_confidence?: string | null;
  raw_text?: string | null;
  imported_lead?: {
    type?: string | null;
    property_interest?: string | null;
    notes?: string | null;
    preferences?: {
      property_type?: string | null;
      location?: string | null;
      features?: unknown;
      other?: unknown;
    } | null;
  } | null;
  buyer_intelligence?: {
    lifestyleCandidates?: Array<{
      key?: string | null;
      value?: boolean | string | number | null;
      strength?: "strong_preference" | "nice_to_have" | string | null;
      confidence?: number | null;
      sourceText?: string | null;
      customerConfirmed?: boolean | null;
    }>;
    personaCandidates?: Array<{
      id?: string | null;
      confidence?: number | null;
      evidence?: string[] | null;
    }>;
  } | null;
}

type JsonScalar = string | number | boolean | null;

type ReviewablePreference = {
  criterion: {
    key: "property_type" | "location" | "other";
    otherKey: string | null;
    operator: "eq" | "contains";
    value: JsonScalar;
    appliesToPropertyTypes: [];
    sourceText: string;
    confidence: number;
    weight: number;
  };
  customerConfirmed: boolean;
};

function clamp(value: unknown, fallback = 0.75) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function safeText(value: unknown, max = 1500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function validEmail(value: unknown) {
  const email = safeText(value, 254);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function propertyTypePreference(value: string | null | undefined): ReviewablePreference | null {
  const sourceText = safeText(value, 160);
  if (!sourceText) return null;
  return {
    criterion: {
      key: "property_type",
      otherKey: null,
      operator: "eq",
      value: normalizePropertyType(sourceText),
      appliesToPropertyTypes: [],
      sourceText,
      confidence: 0.95,
      weight: 0.75,
    },
    customerConfirmed: true,
  };
}

function locationPreference(value: string | null | undefined): ReviewablePreference | null {
  const sourceText = safeText(value, 160);
  if (!sourceText) return null;
  return {
    criterion: {
      key: "location",
      otherKey: null,
      operator: "contains",
      value: sourceText,
      appliesToPropertyTypes: [],
      sourceText,
      confidence: 0.95,
      weight: 0.75,
    },
    customerConfirmed: true,
  };
}

function lifestylePreference(candidate: NonNullable<NonNullable<BuyerIntakeMetadata["buyer_intelligence"]>["lifestyleCandidates"]>[number]): ReviewablePreference | null {
  const otherKey = safeText(candidate.key, 160).toLowerCase();
  if (!otherKey.includes(":")) return null;
  return {
    criterion: {
      key: "other",
      otherKey,
      operator: "eq",
      value: candidate.value ?? true,
      appliesToPropertyTypes: [],
      sourceText: safeText(candidate.sourceText, 512) || otherKey,
      confidence: clamp(candidate.confidence, 0.8),
      weight: candidate.strength === "nice_to_have" ? 0.5 : 0.75,
    },
    customerConfirmed: Boolean(candidate.customerConfirmed),
  };
}

export function buildBuyerIntakeLeadIntelligenceReview(input: {
  contact: BuyerIntakeReviewContact;
  metadata: BuyerIntakeMetadata;
}) {
  const imported = input.metadata.imported_lead || {};
  const reviewable: ReviewablePreference[] = [];
  const propertyPreference = propertyTypePreference(imported.preferences?.property_type);
  const location = locationPreference(imported.preferences?.location);
  if (propertyPreference) reviewable.push(propertyPreference);
  if (location) reviewable.push(location);
  for (const candidate of input.metadata.buyer_intelligence?.lifestyleCandidates || []) {
    const value = lifestylePreference(candidate);
    if (value) reviewable.push(value);
  }

  const preferences = reviewable.map((value) => value.criterion);
  const budget = Number(input.contact.pipelineValue || 0);
  const status = String(input.contact.pipelineStatus || "").toUpperCase();
  const summaryParts = [
    safeText(imported.property_interest, 600),
    safeText(imported.notes, 600),
    preferences.length ? `${preferences.length} reviewable preferences from customer form/intake.` : "No structured preferences extracted yet.",
  ].filter(Boolean);

  const analysis = ExtractedLeadSchema.parse({
    contact: {
      name: safeText(input.contact.name, 160) || null,
      phone: safeText(input.contact.phone, 80) || null,
      email: validEmail(input.contact.email),
      language: null,
      country: null,
    },
    purchaseReadiness: {
      level: status === "QUALIFIED" ? "warm" : "unknown",
      confidence: status === "QUALIFIED" ? 0.65 : 0.4,
      reasoning: status === "QUALIFIED"
        ? "CRM stage is QUALIFIED; Buyer Intake does not infer stronger purchase readiness."
        : "Buyer Intake does not infer purchase readiness from persona or lifestyle data.",
    },
    budget: {
      amount: budget > 0 ? budget : null,
      currency: budget > 0 ? "EUR" : null,
      includesCosts: null,
      approximate: true,
      hardLimit: null,
    },
    propertyTypes: propertyPreference ? [String(propertyPreference.criterion.value)] : [],
    locations: { preferred: location ? [String(location.criterion.value)] : [], excluded: [], flexible: false },
    hardRequirements: [],
    preferences,
    exclusions: [],
    missingInformation: [],
    summary: summaryParts.join(" ").slice(0, 2000) || "Buyer Intake review from imported customer form.",
    suggestedNextAction: "Review every imported preference, approve only documented customer facts, then create or revise the Buyer Profile before property matching.",
  });

  const reviewedCriteria = analysis.preferences.map((item, index) => ({
    criterionType: "preference" as const,
    fingerprint: criterionReviewFingerprint({ criterionType: "preference", index, item }),
    approvalStatus: "pending_review" as const,
    customerConfirmed: reviewable[index]?.customerConfirmed ?? false,
    label: item.key === "other" ? String(item.otherKey || "other") : item.key,
    sourceText: item.sourceText,
    confidence: item.confidence ?? 0.75,
  }));

  return {
    analysis,
    reviewedCriteria,
    personas: input.metadata.buyer_intelligence?.personaCandidates || [],
    source: {
      formType: input.metadata.form_type || "other",
      extractionConfidence: input.metadata.extraction_confidence || "unknown",
      rawTextAvailable: Boolean(input.metadata.raw_text),
    },
    safety: {
      allCriteriaRequireExplicitReview: true,
      personaNotPersistedAsMatchingCriterion: true,
      purchaseReadinessNotInferredFromPersona: true,
      hardRequirementsCreatedAutomatically: false,
    },
  };
}
