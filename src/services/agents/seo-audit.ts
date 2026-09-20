import { choosePublicSitemapPages, inspectPublicSample, type SampledPage } from "./seo-page-sampler";

/**
 * Bounded, read-only public-site observations. This is not a crawler, browser
 * rendering, Search Console URL Inspection, or a performance laboratory.
 *
 * Never accept user-supplied targets: fixed HTTPS origins prevent SSRF and
 * authenticated/private CRM pages from being read into an AI prompt.
 */
export const SEO_AUDIT_TARGETS = [
  { brandId: "zeneco", base: "https://www.zenecohomes.com" },
  { brandId: "pinosoecolife", base: "https://www.pinosoecolife.com" },
  { brandId: "freddyb", base: "https://www.freddybremseth.com" },
  { brandId: "freddypublishing", base: "https://books.freddybremseth.com" },
  { brandId: "freddyart", base: "https://art.freddybremseth.com" },
  { brandId: "remasterfreddy", base: "https://remaster.freddybremseth.com" },
  { brandId: "donaanna", base: "https://www.donaanna.com" },
  { brandId: "chatgenius", base: "https://www.chatgenius.pro" },
] as const;

/** Public service microsites that are technically audited but are not normal
 * Search Console growth targets. Care may deliberately keep private customer
 * routes out of search, so an audit must never imply those routes should index. */
export const SEO_SUPPLEMENTAL_AUDIT_TARGETS = [
  { brandId: "zenecocare", base: "https://care.zenecohomes.com" },
] as const;

type ResponseSnapshot = { status: number; url: string; body: string; contentType: string; xRobots: string };
export type SiteAudit = {
  brandId: string;
  base: string;
  checkedAt: string;
  home: {
    status: number | null;
    finalUrl: string | null;
    title: string | null;
    description: string | null;
    canonical: string | null;
    h1Count: number | null;
    xRobots: string | null;
    robotsMeta: string | null;
    jsonLdCount: number | null;
    jsonLdParseErrors: number | null;
  };
  robots: { status: number | null; sitemapDeclared: boolean | null; googlebotBlocked: boolean | null };
  sitemap: { status: number | null; urlCountSample: number | null; xmlLike: boolean | null };
  observations: string[];
  samples: SampledPage[];
  limitations: string[];
};

type SnapshotFetcher = (url: string) => Promise<ResponseSnapshot>;

function attrs(tag: string) {
  const result: Record<string, string> = {};
  const attribute = /([a-zA-Z][\w:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attribute.exec(tag))) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function metatag(html: string, wanted: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (a.name?.toLowerCase() === wanted) return a.content || null;
  }
  return null;
}

function canonicalTag(html: string) {
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(match[0]);
    if (a.rel?.toLowerCase().split(/\s+/).includes("canonical")) return a.href || null;
  }
  return null;
}

function textFromHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 220);
}

function robotsBlocksGooglebot(text: string) {
  // A conservative signal: report only clear site-wide Disallow: / in the
  // global (*) or dedicated Googlebot group, not partial path directives.
  const lines = text.split(/\r?\n/).map(line => line.split("#")[0].trim());
  let agents: string[] = [];
  let sawRules = false;
  for (const line of lines) {
    if (!line) { agents = []; sawRules = false; continue; }
    const directive = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!directive) continue;
    const key = directive[1].toLowerCase();
    const value = directive[2].trim().toLowerCase();
    if (key === "user-agent") {
      if (sawRules) { agents = []; sawRules = false; }
      agents.push(value);
    } else {
      sawRules = true;
      if (key === "disallow" && value === "/" &&
          agents.some(agent => agent === "*" || agent === "googlebot")) return true;
    }
  }
  return false;
}

function safePublicUrl(url: string, base: string) {
  const parsed = new URL(url, base);
  const origin = new URL(base);
  // Canonical host may redirect between www and apex. Nothing else is allowed.
  const allowed = new Set([origin.hostname, origin.hostname.replace(/^www\./, ""),
    "www." + origin.hostname.replace(/^www\./, "")]);
  if (parsed.protocol !== "https:" || !allowed.has(parsed.hostname) ||
      parsed.username || parsed.password || parsed.port !== "") {
    throw new Error("Public site audit redirect outside allowed host");
  }
  return parsed.href;
}

export async function fetchPublicSnapshot(url: string, base: string): Promise<ResponseSnapshot> {
  let current = safePublicUrl(url, base);
  for (let hop = 0; hop <= 2; hop++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const response = await fetch(current, {
        method: "GET", redirect: "manual", cache: "no-store",
        headers: { Accept: "text/html,application/xml,text/plain;q=0.8", "User-Agent": "RealtyFlow-SEO-Public-Audit/1.0" },
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || hop === 2) throw new Error("Redirect chain unresolved");
        current = safePublicUrl(location, base);
        continue;
      }
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > 600000) throw new Error("Public response exceeded audit size bound");
      const text = await response.text();
      if (text.length > 600000) throw new Error("Public response exceeded audit size bound");
      return {
        status: response.status, url: current, body: text,
        contentType: response.headers.get("content-type") || "",
        xRobots: response.headers.get("x-robots-tag") || "",
      };
    } finally { clearTimeout(timeout); }
  }
  throw new Error("Redirect chain unresolved");
}

export async function auditOneSite(
  target: { brandId: string; base: string },
  fetcher: SnapshotFetcher = url => fetchPublicSnapshot(url, target.base),
): Promise<SiteAudit> {
  const audit: SiteAudit = {
    brandId: target.brandId, base: target.base, checkedAt: new Date().toISOString(),
    home: { status: null, finalUrl: null, title: null, description: null,
      canonical: null, h1Count: null, xRobots: null, robotsMeta: null,
      jsonLdCount: null, jsonLdParseErrors: null },
    robots: { status: null, sitemapDeclared: null, googlebotBlocked: null },
    sitemap: { status: null, urlCountSample: null, xmlLike: null },
    observations: [], samples: [], limitations: [],
  };

  const checks = await Promise.allSettled([
    fetcher(target.base + "/"),
    fetcher(target.base + "/robots.txt"),
    fetcher(target.base + "/sitemap.xml"),
  ]);

  if (checks[0].status === "fulfilled") {
    const snap = checks[0].value;
    audit.home.status = snap.status;
    audit.home.finalUrl = snap.url;
    audit.home.xRobots = snap.xRobots || null;
    if (snap.status !== 200 || !/text\/html/i.test(snap.contentType)) {
      audit.observations.push("Homepage did not return HTML 200; inspect origin/redirect response");
    } else {
      const html = snap.body;
      audit.home.title = textFromHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || "") || null;
      audit.home.description = metatag(html, "description");
      audit.home.canonical = canonicalTag(html);
      audit.home.robotsMeta = metatag(html, "robots");
      audit.home.h1Count = [...html.matchAll(/<h1(?:\s|>)/gi)].length;
      const ld = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(match => attrs("<script " + match[1] + ">").type?.toLowerCase() === "application/ld+json");
      audit.home.jsonLdCount = ld.length;
      audit.home.jsonLdParseErrors = ld.filter(match => {
        try { JSON.parse(match[2]); return false; } catch { return true; }
      }).length;
      if (!audit.home.title) audit.observations.push("Homepage HTML has no server-rendered <title>");
      if (!audit.home.description) audit.observations.push("Homepage HTML has no meta description");
      if (!audit.home.canonical) audit.observations.push("Homepage HTML has no canonical link");
      if (audit.home.h1Count === 0) audit.observations.push("Homepage HTML has no server-rendered H1");
      if (audit.home.jsonLdParseErrors) audit.observations.push("Homepage contains unparsable JSON-LD");
      if (/\bnoindex\b/i.test([audit.home.robotsMeta, audit.home.xRobots].join(" "))) {
        audit.observations.push("Homepage explicitly returns noindex directive");
      }
      if (audit.home.canonical) {
        try {
          const canonical = new URL(audit.home.canonical, snap.url);
          const expected = new URL(target.base);
          if (canonical.hostname !== expected.hostname && canonical.hostname !== expected.hostname.replace(/^www\./, "")) {
            audit.observations.push("Homepage canonical refers to a different host");
          }
        } catch { audit.observations.push("Homepage canonical is not a valid URL"); }
      }
    }
  } else {
    audit.limitations.push("Homepage request failed; no HTML conclusion: " + String(checks[0].reason).slice(0, 100));
  }

  if (checks[1].status === "fulfilled") {
    const snap = checks[1].value;
    audit.robots.status = snap.status;
    if (snap.status === 200) {
      audit.robots.sitemapDeclared = /^sitemap\s*:/im.test(snap.body);
      audit.robots.googlebotBlocked = robotsBlocksGooglebot(snap.body);
      if (audit.robots.googlebotBlocked) audit.observations.push("robots.txt has a site-wide disallow for Googlebot or all bots");
    } else audit.observations.push("robots.txt did not return HTTP 200; inspect crawl rules");
  } else audit.limitations.push("robots.txt request failed; status unknown: " + String(checks[1].reason).slice(0, 100));

  if (checks[2].status === "fulfilled") {
    const snap = checks[2].value;
    audit.sitemap.status = snap.status;
    if (snap.status === 200) {
      audit.sitemap.xmlLike = /<\?xml|<(urlset|sitemapindex)\b/i.test(snap.body);
      audit.sitemap.urlCountSample = [...snap.body.matchAll(/<loc(?:\s|>)/gi)].length;
      if (!audit.sitemap.xmlLike) audit.observations.push("sitemap.xml response does not resemble XML sitemap");
    } else audit.observations.push("sitemap.xml did not return HTTP 200");
  } else audit.limitations.push("sitemap.xml request failed; status unknown: " + String(checks[2].reason).slice(0, 100));

  // Independently inspect at most three real, public, same-host URL-set pages.
  // Unknown request status stays a limitation, not an invented SEO defect.
  const sitemapCheck = checks[2];
  if (sitemapCheck.status === "fulfilled" &&
      sitemapCheck.value.status === 200 &&
      audit.sitemap.xmlLike &&
      !/<sitemapindex(?:\s|>)/i.test(sitemapCheck.value.body)) {
    const targets = choosePublicSitemapPages(sitemapCheck.value.body, target.base, 3);
    const sampled = await Promise.allSettled(targets.map(url => fetcher(url)));
    sampled.forEach((result, index) => {
      const path = new URL(targets[index]).pathname;
      if (result.status === "rejected") {
        audit.limitations.push("Sitemap sample " + path + " unavailable, status unknown: " +
          String(result.reason).slice(0, 100));
        return;
      }
      const page = inspectPublicSample(targets[index], result.value, target.base);
      audit.samples.push(page);
      if (page.issue) audit.observations.push(page.issue);
    });
  } else if (sitemapCheck.status === "fulfilled" &&
             /<sitemapindex(?:\s|>)/i.test(sitemapCheck.value.body)) {
    audit.limitations.push("Sitemap index returned; child sitemaps are not crawled in this bounded audit.");
  }

  audit.limitations.push("Homepage, robots, sitemap and up to three sampled declared public pages only; not a full crawl, rendered JS, field CWV, GSC indexing or AI citations.");
  return audit;
}

export async function auditSEOPortfolio(targets: ReadonlyArray<{ brandId: string; base: string }> = [...SEO_AUDIT_TARGETS, ...SEO_SUPPLEMENTAL_AUDIT_TARGETS]) {
  return Promise.all(targets.map(target => auditOneSite(target)));
}
