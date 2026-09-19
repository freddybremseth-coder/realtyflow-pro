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


type GithubContentResponse = {
  sha?: string; content?: string; encoding?: string;
};

async function readGithubFile(target: PublisherTarget, path: string, token: string, ref: string = target.branch) {
  const response = await githubJson(
    "https://api.github.com/repos/" + target.repository + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref),
    token,
  );
  if (!response.ok) throw new Error("GitHub target read failed: HTTP " + response.status);
  const data = response.data as GithubContentResponse;
  if (typeof data.sha !== "string" || typeof data.content !== "string" || data.encoding !== "base64") {
    throw new Error("GitHub target file payload is incomplete");
  }
  return {
    sha: data.sha,
    content: Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8"),
  };
}

export type GithubSeoPublishResult = {
  repository: string; path: string; previousBlobSha: string;
  previousRef: string; commitSha: string;
};

/**
 * Versioned, exact-file write for the Freddy pilot. The caller must have
 * independently passed seoPublicWriteAllowed(). This function cannot choose
 * a page and cannot alter body copy.
 */
export async function publishFreddySeoMetaChange(input: {
  page: string; title?: string; description?: string; expectedCurrentBlobSha?: string;
}): Promise<GithubSeoPublishResult> {
  const target = TARGETS.freddyb;
  const path = supportedFreddySeoPage(input.page);
  if (!path) throw new Error("Freddy SEO page is outside the approved publisher map");
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("GITHUB_TOKEN missing");

  const status = await verifyGithubSeoPublisher("freddyb");
  if (!status.ready) throw new Error("Freddy GitHub publisher is not verified: " + status.reason);

  const branchRef = await githubJson(
    "https://api.github.com/repos/" + target.repository + "/git/ref/heads/" + target.branch,
    token,
  );
  const object = branchRef.data.object && typeof branchRef.data.object === "object"
    ? branchRef.data.object as Record<string, unknown> : {};
  const previousRef = typeof object.sha === "string" ? object.sha : "";
  if (!branchRef.ok || !/^[0-9a-f]{40}$/i.test(previousRef)) {
    throw new Error("Cannot verify current GitHub branch head");
  }

  const current = await readGithubFile(target, path, token);
  if (input.expectedCurrentBlobSha && current.sha !== input.expectedCurrentBlobSha) {
    throw new Error("SEO target changed since the plan was created; aborting instead of overwriting");
  }
  const next = applyFreddyHtmlMetaChange(current.content, input);
  if (next === current.content) throw new Error("SEO change produced no file change");

  const write = await fetch(
    "https://api.github.com/repos/" + target.repository + "/contents/" +
      path.split("/").map(encodeURIComponent).join("/"),
    {
      method: "PUT",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Sam SEO: bounded metadata improvement for " + input.page,
        content: Buffer.from(next, "utf8").toString("base64"),
        sha: current.sha,
        branch: target.branch,
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const body = await write.json().catch(() => ({})) as Record<string, unknown>;
  const commit = body.commit && typeof body.commit === "object"
    ? body.commit as Record<string, unknown> : {};
  const commitSha = typeof commit.sha === "string" ? commit.sha : "";
  if (!write.ok || !/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("GitHub SEO write failed: HTTP " + write.status);
  }
  return {
    repository: target.repository, path,
    previousBlobSha: current.sha, previousRef, commitSha,
  };
}

export async function rollbackFreddySeoMetaChange(input: {
  path: string; previousRef: string; expectedCurrentBlobSha?: string;
}): Promise<{ commitSha: string }> {
  const target = TARGETS.freddyb;
  const allowed = new Set(Object.values({
    root: "index.html", es: "es/index.html", en: "en/index.html",
    fr: "fr/index.html", de: "de/index.html", ru: "ru/index.html",
  }));
  if (!allowed.has(input.path) || !/^[0-9a-f]{40}$/i.test(input.previousRef)) {
    throw new Error("Rollback target is outside the approved Freddy SEO map");
  }
  const token = process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("GITHUB_TOKEN missing");

  const current = await readGithubFile(target, input.path, token);
  if (input.expectedCurrentBlobSha && current.sha !== input.expectedCurrentBlobSha) {
    throw new Error("Rollback target changed after SEO publication; manual review required");
  }
  const previous = await readGithubFile(target, input.path, token, input.previousRef);
  if (previous.content === current.content) return { commitSha: input.previousRef };

  const response = await fetch(
    "https://api.github.com/repos/" + target.repository + "/contents/" +
      input.path.split("/").map(encodeURIComponent).join("/"),
    {
      method: "PUT",
      headers: { ...githubHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Sam SEO: rollback bounded metadata change",
        content: Buffer.from(previous.content, "utf8").toString("base64"),
        sha: current.sha,
        branch: target.branch,
      }),
      signal: AbortSignal.timeout(12000),
    },
  );
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  const commit = body.commit && typeof body.commit === "object"
    ? body.commit as Record<string, unknown> : {};
  const commitSha = typeof commit.sha === "string" ? commit.sha : "";
  if (!response.ok || !/^[0-9a-f]{40}$/i.test(commitSha)) {
    throw new Error("GitHub SEO rollback failed: HTTP " + response.status);
  }
  return { commitSha };
}
