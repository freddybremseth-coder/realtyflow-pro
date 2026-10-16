import "server-only";
import { resolveDevelopmentRepository } from "./development-repository";

const FILES: Record<string, string[]> = {
  "freddybremseth-coder/realtyflow-pro": [
    "src/components/chatbot/chat-widget.tsx",
    "src/app/api/nexus/victoria/route.ts",
    "src/lib/navigation.ts",
    "src/components/layout/sidebar.tsx",
    "src/lib/nexus/development-intake.ts",
  ],
  "freddybremseth-coder/Altovena": [
    "package.json",
    "README.md",
  ],
};

export type DevelopmentSourceEvidence = {
  path: string;
  sha: string | null;
  excerpt: string | null;
  verified: boolean;
  warning: string | null;
};

export function allowedDevelopmentSourcePaths(repository: string): string[] {
  if (![resolveDevelopmentRepository("realtyflow"), resolveDevelopmentRepository("altovena")].includes(repository))
    return [];
  return FILES[repository] || [];
}

export async function readDevelopmentSource(
  repository: string, path: string, sha: string,
): Promise<DevelopmentSourceEvidence> {
  const fallback: DevelopmentSourceEvidence = {
    path, sha: null, excerpt: null, verified: false, warning: "Kildefil kunne ikke bekreftes",
  };
  if (!allowedDevelopmentSourcePaths(repository).includes(path) || !/^[a-f0-9]{40}$/.test(sha))
    return { ...fallback, warning: "Fil eller commit er ikke tillatt" };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "RealtyFlow-Nexus-Development-Read",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const url = new URL(`https://api.github.com/repos/${repository}/contents/${path}`);
    url.searchParams.set("ref", sha);
    const response = await fetch(url, {
      method: "GET", headers, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { ...fallback, warning: `GitHub HTTP ${response.status}` };
    const raw = await response.text();
    if (raw.length > 150000) return { ...fallback, warning: "Kildeinnhold er for stort" };
    // Small, bounded preview only. Never return secrets or environment files.
    const excerpt = raw.slice(0, 12000);
    return { path, sha, excerpt, verified: true, warning: null };
  } catch {
    return fallback;
  }
}
