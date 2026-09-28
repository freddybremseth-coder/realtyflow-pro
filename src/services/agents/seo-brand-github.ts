import type { BrandPublisher } from "./seo-brand-publishing";

export type GithubRequest = (method: string, path: string, body?: unknown) => Promise<any>;
export function githubRequest(token: string, deadline = Date.now() + 45000): GithubRequest {
  return async (method, path, body) => {
    // All callers build paths from the fixed brand registry, never an external URL.
    if (!path.startsWith("/repos/freddybremseth-coder/")) throw new Error("GitHub scope invalid");
    if (Date.now() >= deadline) throw new Error("Publishing time budget reached; resumes next cycle");
    const response = await fetch("https://api.github.com" + path, {
      method, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(6000, deadline - Date.now()))),
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error("GitHub " + method + " failed (" + response.status + ")");
    return response.status === 204 ? null : response.json();
  };
}
export function githubForSite(site: BrandPublisher, request: GithubRequest) {
  const prefix = "/repos/" + site.repository;
  const call = (method: string, path: string, body?: unknown) => request(method, prefix + path, body);
  return {
    call,
    async main() {
      const ref = await call("GET", "/git/ref/heads/main");
      if (!/^[a-f0-9]{40}$/.test(ref?.object?.sha || "")) throw new Error("Main revision unavailable");
      return ref.object.sha as string;
    },
    async file(path: string, ref: string) {
      if (![site.file, "layout" in site ? site.layout : ""].includes(path)) throw new Error("File outside brand scope");
      const row = await call("GET", "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref));
      if (row?.type !== "file" || row.encoding !== "base64" || !/^[a-f0-9]{40}$/.test(row.sha || "") ||
          typeof row.content !== "string" || (typeof row.size !== "number" || row.size < 0 || row.size > 600000)) throw new Error("Editable source unavailable");
      return { sha: row.sha as string, content: Buffer.from(row.content, "base64").toString("utf8") };
    },
    async green(sha: string): Promise<boolean> {
      if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Invalid check revision");
      const [status, checks] = await Promise.all([
        call("GET", "/commits/" + sha + "/status?per_page=100"),
        call("GET", "/commits/" + sha + "/check-runs?per_page=100"),
      ]);
      // Require a real successful Vercel deployment, not merely no failing tests.
      const contexts = status?.statuses;
      const runs = checks?.check_runs;
      return status?.state === "success" && status.total_count <= 100 && Array.isArray(contexts) && contexts.some(item => (item.context === (site.brandId === "freddyb" ? "Vercel – freddybremseth" : site.brandId === "freddypublishing" ? "Vercel – freddybremseth-books" : site.brandId === "freddyart" ? "Vercel – freddybremseth_art" : "Vercel")) && item.state === "success") &&
        status.total_count === contexts.length && contexts.every(item => item.state === "success") && Array.isArray(runs) && checks.total_count <= 100 && checks.total_count === runs.length &&
        runs.every(item => item.status === "completed" && ["success", "neutral", "skipped"].includes(item.conclusion));
    },
  };
}
