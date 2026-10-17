/**
 * Bounded read-only GitHub state check for a previously audited Visibility PR.
 * Only the explicit public Re-Master repository is supported in this pilot.
 * A matching open head commit is never a permission to merge or publish.
 */
import type { VisibilityCodeCandidate } from "./visibility-code-candidate";

export const MAX_GITHUB_PR_STATUS_CHECKS = 2;
export type VisibilityPullState =
  | "OPEN_SAME_COMMIT" | "DRAFT_SAME_COMMIT" | "COMMIT_CHANGED"
  | "CLOSED" | "MERGED" | "UNAVAILABLE";
export type VisibilityPullStatus = {
  state: VisibilityPullState;
  checkedAt: string;
  currentHeadSha: string | null;
  codeUnchanged: boolean;
  mergeAuthorized: false;
  publicationAuthorized: false;
  verifiedAsPublished: false;
};

const PUBLIC_REPOS = new Set(["freddybremseth-coder/remasterfreddy"]);
// Prevent an oversized/malformed remote response from consuming unbounded memory.
const MAX_GITHUB_PR_RESPONSE_BYTES = 100_000;

function unavailable(now: Date): VisibilityPullStatus {
  return {
    state: "UNAVAILABLE",
    checkedAt: now.toISOString(), currentHeadSha: null,
    codeUnchanged: false, mergeAuthorized: false,
    publicationAuthorized: false, verifiedAsPublished: false,
  };
}
function record(
  state: VisibilityPullState, now: Date, sha: string | null,
): VisibilityPullStatus {
  return {
    state, checkedAt: now.toISOString(), currentHeadSha: sha,
    codeUnchanged: state === "OPEN_SAME_COMMIT" || state === "DRAFT_SAME_COMMIT",
    mergeAuthorized: false, publicationAuthorized: false, verifiedAsPublished: false,
  };
}

type GitHubPull = {
  number?: unknown;
  html_url?: unknown;
  state?: unknown;
  draft?: unknown;
  merged_at?: unknown;
  head?: { sha?: unknown } | null;
  base?: { repo?: { full_name?: unknown } | null } | null;
};

/**
 * Uses a fixed GitHub API origin; no client URL, no credentials, no GitHub
 * mutations. Throws nothing to the UI when the service is unavailable.
 */
export async function checkVisibilityPullStatus(
  candidate: VisibilityCodeCandidate,
  transport: typeof fetch = fetch,
  now = new Date(),
): Promise<VisibilityPullStatus> {
  if (!PUBLIC_REPOS.has(candidate.repo) ||
      !Number.isSafeInteger(candidate.pullNumber) ||
      candidate.pullNumber < 1 || candidate.pullNumber > 10_000_000 ||
      !/^[0-9a-f]{40}$/.test(candidate.commitSha) ||
      candidate.url !== "https://github.com/" + candidate.repo + "/pull/" + candidate.pullNumber ||
      candidate.reviewOnly !== true || candidate.executionStarted !== false ||
      candidate.publicationAuthorized !== false) return unavailable(now);

  const endpoint = "https://api.github.com/repos/" + candidate.repo +
    "/pulls/" + candidate.pullNumber;
  try {
    const response = await transport(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    if (!response.ok ||
        Number(response.headers.get("content-length") || 0) > MAX_GITHUB_PR_RESPONSE_BYTES ||
        !response.body) return unavailable(now);
    // The Content-Length header is untrusted: cap bytes while streaming as well.
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_GITHUB_PR_RESPONSE_BYTES) {
          await reader.cancel().catch(() => {});
          return unavailable(now);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as GitHubPull | null;
    if (!body || body.number !== candidate.pullNumber ||
        body.html_url !== candidate.url ||
        body.base?.repo?.full_name !== candidate.repo ||
        (body.state !== "open" && body.state !== "closed") ||
        typeof body.draft !== "boolean" ||
        typeof body.head?.sha !== "string" ||
        !/^[0-9a-f]{40}$/.test(body.head.sha)) return unavailable(now);

    const sha = body.head.sha;
    if (body.merged_at != null) {
      if (typeof body.merged_at !== "string" ||
          !Number.isFinite(Date.parse(body.merged_at)) ||
          body.state !== "closed") return unavailable(now);
      return record("MERGED", now, sha);
    }
    if (body.state === "closed") return record("CLOSED", now, sha);
    if (sha !== candidate.commitSha) return record("COMMIT_CHANGED", now, sha);
    return record(body.draft ? "DRAFT_SAME_COMMIT" : "OPEN_SAME_COMMIT", now, sha);
  } catch {
    // GitHub can rate-limit or be inaccessible. Never convert that to APPROVED.
    return unavailable(now);
  }
}
