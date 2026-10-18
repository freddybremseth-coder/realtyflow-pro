import type { ProjectFact } from "./visibility-project-page-review";

/**
 * Evidence registry contract for project claims. A record is a submitted
 * attestation, not independently corroborated source content.
 * This module performs no writes, fetching, approval, or publication.
 */
export type ClaimEvidence = {
  fact: ProjectFact;
  sourceKind: "developer_document" | "public_official" | "signed_contract" | "other";
  sourceTitle: string;
  reviewerId: string;
  reviewedAt: string;
  documentId?: string;
  notes?: string;
};
export type EvidenceIssue = {
  key: ProjectFact["key"];
  reason: "SOURCE_MISSING" | "REVIEWER_MISSING" | "REVIEW_DATE_INVALID" |
    "SOURCE_IDENTITY_MISSING" | "CLAIM_VALUE_MISSING" | "ATTESTATION_MISSING";
};
function validDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}
/** Syntactic readiness only: no assumption that cited content supports a claim. */
export function assessClaimEvidence(records: readonly ClaimEvidence[]) {
  const issues: EvidenceIssue[] = [];
  for (const record of records) {
    const key = record.fact.key;
    if (!record.fact.value.trim()) issues.push({ key, reason: "CLAIM_VALUE_MISSING" });
    if (!record.sourceTitle.trim() || (!record.fact.sourceUrl && !record.documentId?.trim()))
      issues.push({ key, reason: "SOURCE_MISSING" });
    if (!record.reviewerId.trim()) issues.push({ key, reason: "REVIEWER_MISSING" });
    if (!validDateTime(record.reviewedAt) || !record.fact.checkedAt)
      issues.push({ key, reason: "REVIEW_DATE_INVALID" });
    if (record.sourceKind === "other" && !record.notes?.trim())
      issues.push({ key, reason: "SOURCE_IDENTITY_MISSING" });
    if (record.fact.verifiedByHuman !== true)
      issues.push({ key, reason: "ATTESTATION_MISSING" });
  }
  return {
    recordCount: records.length,
    issues,
    readiness: records.length === 0 ? "NO_EVIDENCE" as const :
      issues.length ? "EVIDENCE_INCOMPLETE" as const : "READY_FOR_INDEPENDENT_CHECK" as const,
    independentlyVerified: false as const,
    approvalGranted: false as const,
    publicationEligible: false as const,
  };
}
