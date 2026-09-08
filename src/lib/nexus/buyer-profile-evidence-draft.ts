import type { BuyerProfileEvidenceCandidate } from "./buyer-profile-evidence";

export type EvidenceDraftCriterion = {
  criterionType: "preference";
  key: "property_type" | "bedrooms" | "other";
  otherKey: string | null;
  operator: "eq" | "gte";
  value: string | number;
  weight: number;
  severity: null;
  appliesToPropertyTypes: [];
  source: "ai_suggestion";
  sourceText: string;
  confidence: number;
  customerConfirmed: false;
  approvalStatus: "pending";
  approvedBy: null;
  approvedAt: null;
  active: true;
};

export type BuyerProfileEvidenceDraftDecision = {
  eligible: boolean;
  reason: string;
  criteria: EvidenceDraftCriterion[];
  minimumConfidence: number;
  requiresReview: true;
  profileStatus: "draft";
};

export const EVIDENCE_DRAFT_MIN_CONFIDENCE = 0.95;

export function buildBuyerProfileEvidenceDraftCriteria(
  candidates: BuyerProfileEvidenceCandidate[],
): EvidenceDraftCriterion[] {
  return candidates
    .filter((candidate) => candidate.confidence >= EVIDENCE_DRAFT_MIN_CONFIDENCE)
    .map((candidate) => ({
      criterionType: "preference" as const,
      key: candidate.key,
      otherKey: candidate.otherKey,
      operator: candidate.operator,
      value: candidate.value,
      weight: 0.75,
      severity: null,
      appliesToPropertyTypes: [] as [],
      source: "ai_suggestion" as const,
      sourceText: candidate.sourceText.slice(0, 2000),
      confidence: candidate.confidence,
      customerConfirmed: false as const,
      approvalStatus: "pending" as const,
      approvedBy: null,
      approvedAt: null,
      active: true as const,
    }));
}

export function decideBuyerProfileEvidenceDraft(input: {
  candidates: BuyerProfileEvidenceCandidate[];
  conflictCount: number;
}) : BuyerProfileEvidenceDraftDecision {
  if (input.conflictCount > 0) {
    return {
      eligible: false,
      reason: "Explicit CRM evidence contains conflicts and must be resolved before persistence.",
      criteria: [],
      minimumConfidence: EVIDENCE_DRAFT_MIN_CONFIDENCE,
      requiresReview: true,
      profileStatus: "draft",
    };
  }

  const criteria = buildBuyerProfileEvidenceDraftCriteria(input.candidates);
  if (!criteria.length) {
    return {
      eligible: false,
      reason: `No explicit CRM evidence meets the ${Math.round(EVIDENCE_DRAFT_MIN_CONFIDENCE * 100)}% draft threshold.`,
      criteria: [],
      minimumConfidence: EVIDENCE_DRAFT_MIN_CONFIDENCE,
      requiresReview: true,
      profileStatus: "draft",
    };
  }

  return {
    eligible: true,
    reason: `${criteria.length} explicit evidence criterion${criteria.length === 1 ? "" : "a"} can be stored as pending draft suggestions.`,
    criteria,
    minimumConfidence: EVIDENCE_DRAFT_MIN_CONFIDENCE,
    requiresReview: true,
    profileStatus: "draft",
  };
}
