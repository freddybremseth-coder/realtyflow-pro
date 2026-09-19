type PublisherBrand = "freddyb" | "zeneco";

type PublisherTarget = {
  brandId: PublisherBrand;
  repository: string;
  probePath: string;
  branch: "main";
};

const TARGETS: Record<PublisherBrand, PublisherTarget> = {
  freddyb: {
    brandId: "freddyb",
    repository: "freddybremseth-coder/freddybremseth",
    probePath: "es/index.html",
    branch: "main",
  },
  zeneco: {
    brandId: "zeneco",
    repository: "freddybremseth-coder/zenecohomes",
    probePath: "src/app/page.tsx",
    branch: "main",
  },
};

export type GithubSeoPublisherStatus = {
  brandId: PublisherBrand;
  repository: string;
  ready: boolean;
  canPush: boolean;
  canReadTarget: boolean;
  reason: string;
};

function githubHeaders(token: string) {
  return {
    Authorization: "Bearer " + token,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "RealtyFlow-Sam-SEO",
  };
}

async function githubJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: githubHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(9000),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, data };
}

/**
 * Verifies the exact owner-controlled repository and one known target file.
 * This performs no write. We only report whether the server-side GitHub token
 * can read the repository and advertises push permission for it.
 */
export async function verifyGithubSeoPublisher(brandId: PublisherBrand): Promise<GithubSeoPublisherStatus> {
  const target = TARGETS[brandId];
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) return {
    brandId, repository: target.repository, ready: false, canPush: false,
    canReadTarget: false, reason: "GITHUB_TOKEN mangler i RealtyFlow-produksjon.",
  };

  const repo = await githubJson("https://api.github.com/repos/" + target.repository, token);
  if (!repo.ok) return {
    brandId, repository: target.repository, ready: false, canPush: false,
    canReadTarget: false, reason: "GitHub-repositoriet kan ikke verifiseres fra RealtyFlow (HTTP " + repo.status + ").",
  };
  const permissions = (repo.data.permissions && typeof repo.data.permissions === "object")
    ? repo.data.permissions as Record<string, unknown> : {};
  const canPush = permissions.push === true || permissions.admin === true;

  const file = await githubJson(
    "https://api.github.com/repos/" + target.repository + "/contents/" +
      target.probePath.split("/").map(encodeURIComponent).join("/") + "?ref=" + target.branch,
    token,
  );
  const canReadTarget = file.ok && typeof file.data.sha === "string";
  const ready = canPush && canReadTarget;
  return {
    brandId, repository: target.repository, ready, canPush, canReadTarget,
    reason: ready
      ? "Verifisert GitHub-kanal: eksakt repo kan leses og token har push-rettighet."
      : !canPush
        ? "GitHub-tokenet kan lese repoet, men har ikke bekreftet push-rettighet."
        : "GitHub-tokenet har push-rettighet, men den forventede målfilen kan ikke leses.",
  };
}

export function supportedFreddySeoPage(page: string): string | null {
  const routes: Record<string, string> = {
    "/": "index.html",
    "/es/": "es/index.html",
    "/en/": "en/index.html",
    "/fr/": "fr/index.html",
    "/de/": "de/index.html",
    "/ru/": "ru/index.html",
  };
  return routes[page] || null;
}

function safeMetaText(value: string, max: number) {
  const text = value.replace(/[<>\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > max) throw new Error("SEO metadata is empty or too long");
  if (/\b(best|#1|number one|guaranteed|billigst|best i test|garantert)\b/i.test(text)) {
    throw new Error("SEO metadata contains an unsupported promotional claim");
  }
  return text;
}

export function applyFreddyHtmlMetaChange(
  html: string,
  input: { title?: string; description?: string },
): string {
  const title = input.title ? safeMetaText(input.title, 68) : null;
  const description = input.description ? safeMetaText(input.description, 180) : null;
  if (!title && !description) throw new Error("No SEO metadata change supplied");

  let next = html;
  if (title) {
    if (!/<title>[^<]*<\/title>/i.test(next)) throw new Error("HTML title tag missing");
    next = next.replace(/<title>[^<]*<\/title>/i, "<title>" + title + "</title>");
    if (/<meta\s+property=["']og:title["']\s+content=["'][^"']*["']\s*\/?>/i.test(next)) {
      next = next.replace(
        /<meta\s+property=["']og:title["']\s+content=["'][^"']*["']\s*\/?>/i,
        '<meta property="og:title" content="' + title + '" />',
      );
    }
  }
  if (description) {
    if (!/<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i.test(next)) {
      throw new Error("HTML description tag missing");
    }
    next = next.replace(
      /<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*\/?>/i,
      '<meta name="description" content="' + description + '" />',
    );
    if (/<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/i.test(next)) {
      next = next.replace(
        /<meta\s+property=["']og:description["']\s+content=["'][^"']*["']\s*\/?>/i,
        '<meta property="og:description" content="' + description + '" />',
      );
    }
  }
  // Protect the public page body: this pilot may alter head metadata only.
  const bodyBefore = html.slice(html.toLowerCase().indexOf("<body"));
  const bodyAfter = next.slice(next.toLowerCase().indexOf("<body"));
  if (bodyBefore !== bodyAfter) throw new Error("SEO pilot attempted to modify page body");
  return next;
}
