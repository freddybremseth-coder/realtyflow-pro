import "server-only";
import { resolveDevelopmentRepository } from "./development-repository";

export interface DevelopmentRepositoryEvidence {
  repository: string;
  defaultBranch: string | null;
  headSha: string | null;
  latestCommitUrl: string | null;
  source: "github";
  verified: boolean;
  warning: string | null;
}

function recognizedRepository(fullName: string): boolean {
  return resolveDevelopmentRepository("realtyflow") === fullName
    || resolveDevelopmentRepository("altovena") === fullName;
}

export async function readDevelopmentRepositoryEvidence(fullName: string): Promise<DevelopmentRepositoryEvidence> {
  if (!recognizedRepository(fullName)) throw new Error("REPOSITORY_NOT_ALLOWED");
  const fallback: DevelopmentRepositoryEvidence = {
    repository: fullName, defaultBranch: null, headSha: null,
    latestCommitUrl: null, source: "github", verified: false, warning: "GitHub-kilde kunne ikke bekreftes.",
  };
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "RealtyFlow-Nexus-Development-Read",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = async (path: string) => {
    const response = await fetch(`https://api.github.com/repos/${fullName}${path}`, {
      method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`);
    return response.json();
  };
  try {
    const metadata = await request("");
    const defaultBranch = typeof metadata.default_branch === "string" ? metadata.default_branch : "";
    if (!/^[a-zA-Z0-9._/-]{1,120}$/.test(defaultBranch) || defaultBranch.includes("..")) {
      return { ...fallback, warning: "Ugyldig default branch fra GitHub." };
    }
    const commit = await request(`/commits/${encodeURIComponent(defaultBranch)}`);
    const sha = typeof commit.sha === "string" && /^[a-f0-9]{40}$/.test(commit.sha) ? commit.sha : null;
    if (!sha) return { ...fallback, defaultBranch, warning: "GitHub returnerte ingen gyldig commit." };
    return {
      repository: fullName, defaultBranch, headSha: sha,
      latestCommitUrl: `https://github.com/${fullName}/commit/${sha}`,
      source: "github", verified: true, warning: null,
    };
  } catch {
    return fallback;
  }
}
