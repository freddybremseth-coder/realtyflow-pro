/**
 * Read-only bridge from an OWNER-requested Altovena Visibility design to an
 * independently verified GitHub pull request. This is NOT merge approval.
 *
 * A candidate is useful evidence only when it cites the exact, previously
 * journalled design request for the same work item. The requester cannot
 * create/approve a candidate through the owner-facing API.
 */
export const VISIBILITY_CODE_CANDIDATE_ACTION = "visibility_code_review_candidate";

export type VisibilityCodeCandidate = {
  url: string;
  repo: string;
  pullNumber: number;
  commitSha: string;
  recordedAt: string;
  reviewOnly: true;
  executionStarted: false;
  publicationAuthorized: false;
};

type LogRow = {
  id?: unknown;
  created_at?: unknown;
  details?: unknown;
};

type WorkRef = {
  id: string;
  brand_id: string;
  source_id: string;
};

const REPO_FOR_BRAND: Record<string, string> = {
  // Initial controlled pilot. A future SaaS installer needs explicit
  // per-tenant repository grants, not access inherited from SEO auditing.
  remasterfreddy: "freddybremseth-coder/remasterfreddy",
};

function object(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value))
    return value as Record<string, unknown>;
  return null;
}

export function resolveVisibilityCodeCandidate(
  work: WorkRef,
  designRequests: LogRow[],
  candidateLogs: LogRow[],
): VisibilityCodeCandidate | null {
  const allowedRepo = REPO_FOR_BRAND[work.brand_id];
  if (!allowedRepo || !work.source_id.startsWith("visibility:" + work.brand_id + ":"))
    return null;

  const requestsById = new Map<string, { details: Record<string, unknown>; createdAt: number }>();
  for (const row of designRequests) {
    const d = object(row.details);
    if (typeof row.id !== "string" || typeof row.created_at !== "string" ||
        !Number.isFinite(Date.parse(row.created_at)) || !d ||
        d.work_item_id !== work.id || d.brand_id !== work.brand_id ||
        d.source_id !== work.source_id || d.intent !== "design_review_only" ||
        d.approval_granted !== false || d.publication_authorized !== false ||
        d.execution_started !== false ||
        typeof d.proposal_fingerprint !== "string" ||
        !/^[0-9a-f]{64}$/.test(d.proposal_fingerprint)) continue;
    requestsById.set(row.id, { details: d, createdAt: Date.parse(row.created_at) });
  }

  for (const log of candidateLogs) {
    const d = object(log.details);
    if (!d || typeof log.created_at !== "string" ||
        !Number.isFinite(Date.parse(log.created_at)) ||
        d.work_item_id !== work.id || d.brand_id !== work.brand_id ||
        d.source_id !== work.source_id ||
        d.candidate_kind !== "review_only_pull_request" ||
        d.review_only !== true || d.execution_started !== false ||
        d.publication_authorized !== false ||
        d.approval_granted !== false || d.merge_authorized !== false ||
        typeof d.design_request_log_id !== "string") continue;

    const request = requestsById.get(d.design_request_log_id);
    if (!request || Date.parse(log.created_at) < request.createdAt ||
        d.proposal_fingerprint !== request.details.proposal_fingerprint ||
        d.repo !== allowedRepo || typeof d.url !== "string" ||
        typeof d.commit_sha !== "string" ||
        !/^[0-9a-f]{40}$/.test(d.commit_sha)) continue;
    const prNum = d.pull_number;
    if (typeof prNum !== "number" || !Number.isSafeInteger(prNum) ||
        prNum < 1 || prNum > 10000000) continue;

    try {
      const url = new URL(d.url);
      const canonical = "https://github.com/" + allowedRepo + "/pull/" + prNum;
      if (url.href !== canonical || url.username || url.password ||
          url.search || url.hash) continue;
      return {
        url: canonical, repo: allowedRepo, pullNumber: prNum,
        commitSha: d.commit_sha, recordedAt: log.created_at,
        reviewOnly: true, executionStarted: false,
        publicationAuthorized: false,
      };
    } catch { continue; }
  }
  return null;
}
