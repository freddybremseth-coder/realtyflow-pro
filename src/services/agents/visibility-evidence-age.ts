/**
 * An observed result is never a full SEO approval. This helper only checks
 * when the underlying bounded observation was recorded; it does not recrawl.
 *
 * Sam's portfolio checks are weekly. Reports older than ten days need a fresh
 * check before they can be described as current.
 */
export type VisibilityEvidenceAge = "RECENT" | "AGED" | "UNKNOWN";
export const VISIBILITY_RECENCY_WINDOW_DAYS = 10;

export function visibilityEvidenceAge(
  checkedAt: string | null | undefined,
  now: Date = new Date(),
): VisibilityEvidenceAge {
  const timestamp = checkedAt ? Date.parse(checkedAt) : NaN;
  const nowMs = now.getTime();
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs)) return "UNKNOWN";
  const elapsedMs = nowMs - timestamp;
  // Device clock problems and future-dated reports are not fresh evidence.
  if (elapsedMs < -15 * 60_000) return "UNKNOWN";
  if (elapsedMs > VISIBILITY_RECENCY_WINDOW_DAYS * 24 * 60 * 60_000) return "AGED";
  return "RECENT";
}
