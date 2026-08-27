import { criterionReviewFingerprint } from "@/services/lead-intelligence/review-shared";
import {
  ExtractedLeadSchema,
  normalizePropertyType,
  type BoundedJson,
} from "@/services/lead-intelligence/contracts";

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

type ReviewCriterion = {
  criterionType: "preference";
  fingerprint: string;
  approvalStatus: "pending_review";
  customerConfirmed: boolean;
  label: string;
  sourceText: string;
  confidence: number;
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

function propertyTypePreference(value: string | null | undefined) {
  const sourceText = safeText(value, 160);
  if (!sourceText) return null;
  const normalized = normalizePropertyType(sourceText);
  return {
    key: "property_type" as const,
    otherKey: null,
    operator: "eq" as const,
    value: normalized as BoundedJson,
    appliesToPropertyTypes: [],
    sourceText,
    confidence: 0.95,
    weight: 0.75,
  };
}

function locationPreference(value: string | null | undefined) {
  const sourceText = safeText(value, 160);
  if (!sourceText) return null;
  return {
    key: "location" as const,
    otherKey: null,
    operator: "contains" as const,
    value: sourceText as BoundedJson,
    appliesToPropertyTypes: [],
    sourceText,
    confidence: 0.95,
    weight: 0.75,
  };
}

function lifestylePreference(candidate: NonNullable<NonNullable<BuyerIntakeMetadata["buyer_intelligence"]>["lifestyleCandidates"]>[number]) {
  const otherKey = safeText(candidate.key, 160).toLowerCase();
  if (!otherKey.includes(":")) return null;
  const sourceText = safeText(candidate.sourceText, 512) || otherKey;
  return {
    key: "other" as const,
    otherKey,
    operator: "eq" as const,
    value: (candidate.value ?? true) as BoundedJson,
    appliesToPropertyTypes: [],
    sourceText,
    confidence: clamp(candidate.confidence, 0.8),
    weight: candidate.strength === "nice_to_have" ? 0.5 : 0.75,
    customerConfirmed: Boolean(candidate.customerConfirmed),
  };
}

function reviewRows(preferences: Array<Record<string, unknown> & { customerConfirmed?: boolean }>): ReviewCriterion[] {
  return preferences.map((item, index) => ({
    criterionType: "preference" as const,
    fingerprint: criterionReviewFingerprint({ criterionType: "preference", index, item }),
    approvalStatus: "pending_review" as const,
    customerConfirmed: Boolean(item.customerConfirmed),
    label: item.key === "other" ? String(item.otherKey || "other") : String(item.key || "preference"),
    sourceText: String(item.sourceText || ""),
    confidence: clamp(item.confidence, 0.75),
  }));
}

export function buildBuyerIntakeLeadIntelligenceReview(input: {
  contact: BuyerIntakeReviewContact;
  metadata: BuyerIntakeMetadata;
}) {
  const imported = input.metadata.imported_lead || {};
  const lifestyle = input.metadata.buyer_intelligence?.lifestyleCandidates || [];
  const propertyPreference = propertyTypePreference(imported.preferences?.property_type);
  const location = locationPreference(imported.preferences?.location);
  const lifestylePreferences = lifestyle.map(lifestylePreference).filter((value): value is NonNullable<ReturnType<typeof lifestylePreference>> => Boolean(value));
  const preferences = [propertyPreference, location, ...lifestylePreferences]
    .filter((value): value is NonNullable<typeof value> => Boolean(value))
    .map((value) => ({ ...value, customerConfirmed: "customerConfirmed" in value ? Boolean(value.customerConfirmed) : true }));

  const budget = Number(input.contact.pipelineValue || 0);
  const locations = location ? [String(location.value)] : [];
  const propertyTypes = propertyPreference ? [String(propertyPreference.value)] : [];
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
    propertyTypes,
    locations: { preferred: locations, excluded: [], flexible: false },
    hardRequirements: [],
    preferences,
    exclusions: [],
    missingInformation: [],
    summary: summaryParts.join(" ").slice(0, 2000) || "Buyer Intake review from imported customer form.",
    suggestedNextAction: "Review every imported preference, approve only documented customer facts, then create or revise the Buyer Profile before property matching.",
  });

  return {
    analysis,
    reviewedCriteria: reviewRows(analysis.preferences as Array<Record<string, unknown> & { customerConfirmed?: boolean }>),
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
