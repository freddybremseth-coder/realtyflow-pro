/**
 * Read-only repository capability check for Sam. Neither a repository permission
 * nor a passing probe proves that a reversible website publisher is active.
 * Never return a token, file contents or an arbitrary user-supplied URL.
 */
type Brand = "freddyb" | "zeneco";
const TARGETS: Record<Brand, { repository: string; path: string }> = {
  freddyb: { repository: "freddybremseth-coder/freddybremseth", path: "es/index.html" },
  zeneco: { repository: "freddybremseth-coder/zenecohomes", path: "src/app/page.tsx" },
};
export type GithubSeoCapability = {
  brandId: Brand;
  repository: string;
  tokenConfigured: boolean;
  canReadTarget: boolean;
  hasPushPermission: boolean;
  status: "missing_token" | "github_unavailable" | "target_unavailable" |
    "read_only" | "permission_detected";
  message: string;
};

export function classifyGithubSeoCapability(
  targetRepository: string,
  repository: { full_name?: unknown; permissions?: { push?: unknown; admin?: unknown } } | null,
  file: { sha?: unknown; type?: unknown } | null,
): Pick<GithubSeoCapability, "canReadTarget" | "hasPushPermission" | "status"> {
  const correctRepo = repository?.full_name === targetRepository;
  const hasPushPermission = correctRepo &&
    (repository?.permissions?.push === true || repository?.permissions?.admin === true);
  const canReadTarget = correctRepo && typeof file?.sha === "string" &&
    /^[0-9a-f]{40}$/i.test(file.sha) && file.type === "file";
  return {
    canReadTarget,
    hasPushPermission,
    status: !correctRepo ? "github_unavailable"
      : !canReadTarget ? "target_unavailable"
      : !hasPushPermission ? "read_only" : "permission_detected",
  };
}

async function githubGET(url: string, token: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "RealtyFlow-Sam-SEO-ReadOnly-Probe",
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  return await response.json().catch(() => null) as Record<string, unknown> | null;
}

export async function checkGithubSeoCapability(brandId: Brand): Promise<GithubSeoCapability> {
  const target = TARGETS[brandId];
  const common = { brandId, repository: target.repository };
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) return {
    ...common, tokenConfigured: false, canReadTarget: false, hasPushPermission: false,
    status: "missing_token", message: "RealtyFlow mangler serverkonfigurert GitHub-tilgang for dette repoet.",
  };
  try {
    const prefix = "https://api.github.com/repos/" + target.repository;
    const repository = await githubGET(prefix, token);
    if (repository?.full_name !== target.repository) return {
      ...common, tokenConfigured: true, canReadTarget: false, hasPushPermission: false,
      status: "github_unavailable", message: "Eksakt GitHub-repo kunne ikke verifiseres fra RealtyFlow.",
    };
    const file = await githubGET(prefix + "/contents/" +
      target.path.split("/").map(encodeURIComponent).join("/") + "?ref=main", token);
    const result = classifyGithubSeoCapability(target.repository, repository, file);
    return {
      ...common, tokenConfigured: true, ...result,
      message: result.status === "permission_detected"
        ? "Repo, målfil og push-rettighet er funnet. Automatisk publisering og tilbakeføring er IKKE verifisert eller aktivert av denne kontrollen."
        : result.status === "read_only"
          ? "Repo og målfil kan leses, men push-rettighet er ikke bekreftet."
          : "Den forventede målfilen kunne ikke verifiseres; ingen publisering tillates.",
    };
  } catch {
    return {
      ...common, tokenConfigured: true, canReadTarget: false, hasPushPermission: false,
      status: "github_unavailable", message: "GitHub-kontrollen kunne ikke gjennomføres; ingen publisering tillates.",
    };
  }
}
