import type { ClaimEvidence } from "./visibility-project-evidence";

/**
 * Append-only event envelope for eventual server-side persistence.
 * Never accept reviewer identity or approval authority from an untrusted browser.
 * No SQL, storage writes or publication actions live in this module.
 */
export type ProjectEvidenceEvent = {
  eventId: string;
  brandId: string;
  projectUrl: string;
  claimKey: ClaimEvidence["fact"]["key"];
  event: "SOURCE_RECORDED" | "REVIEW_REQUESTED" | "REVIEW_ATTESTED" | "REVIEW_REVOKED";
  actorId: string;
  recordedAt: string;
  evidence?: ClaimEvidence;
};
export function inspectProjectEvidenceHistory(events: readonly ProjectEvidenceEvent[]) {
  const timeline = [...events].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  const issues: string[] = [];
  const unique = new Set<string>();
  const claims = new Map<string, { sourceRecorded: boolean; reviewAttested: boolean; revoked: boolean }>();
  for (const item of timeline) {
    if (!item.eventId || unique.has(item.eventId)) issues.push("DUPLICATE_OR_MISSING_EVENT_ID");
    unique.add(item.eventId);
    if (!item.brandId || !item.projectUrl.startsWith("https://") || !item.actorId ||
      Number.isNaN(Date.parse(item.recordedAt))) issues.push("INVALID_EVENT_CONTEXT");
    const key = item.brandId + "|" + item.projectUrl + "|" + item.claimKey;
    const state = claims.get(key) ?? { sourceRecorded: false, reviewAttested: false, revoked: false };
    if (item.event === "SOURCE_RECORDED") {
      state.sourceRecorded = Boolean(item.evidence?.sourceTitle && (item.evidence.documentId || item.evidence.fact.sourceUrl));
      state.reviewAttested = false;
      state.revoked = false;
    } else if (item.event === "REVIEW_ATTESTED") {
      if (!state.sourceRecorded) issues.push("REVIEW_WITHOUT_SOURCE");
      state.reviewAttested = state.sourceRecorded && Boolean(item.evidence?.fact.verifiedByHuman);
    } else if (item.event === "REVIEW_REVOKED") {
      state.revoked = true;
      state.reviewAttested = false;
    }
    claims.set(key, state);
  }
  return {
    timeline,
    claims: [...claims].map(([key,state])=>({ key, ...state })),
    issues,
    // History alone cannot prove independent verification.
    independentlyVerified: false as const,
    approvalGranted: false as const,
    publicationEligible: false as const,
  };
}
