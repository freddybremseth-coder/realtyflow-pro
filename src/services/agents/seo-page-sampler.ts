/**
 * Choose up to three inspectable PUBLIC pages already declared by a brand's
 * bounded sitemap response. No arbitrary URLs, site search, or internal APIs.
 * This is a sitemap sample, not proof of coverage, accessibility or indexing.
 */
type Candidate = { href: string; path: string; group: string };

function eligibleSitemapUrl(raw: string, siteBase: string): Candidate | null {
  if (!raw || raw.includes("&") || raw.includes("<") || raw.includes(">")) return null;
  try {
    const url = new URL(raw.trim());
    const base = new URL(siteBase);
    const canonicalHost = base.hostname.replace(/^www\./, "");
    if (url.protocol !== "https:" ||
        ![canonicalHost, "www." + canonicalHost].includes(url.hostname) ||
        url.username || url.password || url.port || url.search || url.hash ||
        url.pathname.length > 210 || /[@\r\n]/.test(url.pathname) ||
        /%(?:00|0[0-9a-f]|1[0-9a-f]|40)/i.test(url.pathname)) return null;
    const path = url.pathname;
    if (path === "/" || path === "/robots.txt" || path === "/sitemap.xml" ||
        /^\/(?:api|admin|auth|login|dashboard|portal|min-side|app|konto|account)(?:\/|$)/i.test(path)) return null;
    const group = /\/(?:eiendommer|properties|immobilien|propiedades)\/[^/]+/i.test(path)
      ? "property"
      : /\/(?:magasin|artikler|blogg|blog|guide|guides|oppskrifter|books)\/[^/]+/i.test(path)
        ? "editorial"
        : /\/(?:omrader|områder|areas|inland|livet-i-innlandet|zonas)\/[^/]+/i.test(path)
          ? "local"
          : "other";
    return { href: url.href, path, group };
  } catch { return null; }
}

export function choosePublicSitemapPages(xml: string, siteBase: string, limit = 3, rotation = 0): string[] {
  // Do not follow sitemap index references as HTML pages. Index resolution is
  // deliberately a separate bounded capability, not an implicit crawler.
  if (!/<urlset(?:\s|>)/i.test(xml) || /<sitemapindex(?:\s|>)/i.test(xml)) return [];
  const seen = new Set<string>();
  const groups = new Map<string, Candidate[]>();
  for (const match of xml.matchAll(/<url(?:\s[^>]*)?>[\s\S]*?<loc(?:\s[^>]*)?>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)) {
    const candidate = eligibleSitemapUrl(match[1], siteBase);
    if (!candidate || seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    const group = groups.get(candidate.group) || [];
    group.push(candidate);
    groups.set(candidate.group, group);
  }
  // Book and art sitemaps begin with the homepage, generic information pages
  // or three language variants of one title. A fixed first-three sample would
  // never inspect most actual works. Rotate real, explicitly sitemapped public
  // item URLs while keeping the SAME three-page/host HTTP request boundary.
  const host = new URL(siteBase).hostname.toLowerCase();
  const other = groups.get("other") || [];
  const day = Number.isFinite(rotation) ? Math.max(0, Math.trunc(rotation)) : 0;
  if (host === "books.freddybremseth.com") {
    const books = new Map<string, Candidate[]>();
    for (const item of other) {
      const match = /^\\/(?:(?:en|es)\\/)?book\\/([a-z0-9-]+)\\/?$/.exec(item.path);
      if (!match) continue;
      const variants = books.get(match[1]) || [];
      variants.push(item);
      books.set(match[1], variants);
    }
    const uniqueBooks = [...books.values()];
    if (uniqueBooks.length) {
      return Array.from({ length: Math.min(limit, uniqueBooks.length) }, (_, i) => {
        const variants = uniqueBooks[(day * limit + i) % uniqueBooks.length];
        return variants[day % variants.length].href;
      });
    }
  }
  if (host === "art.freddybremseth.com") {
    const artworks = other.filter(item => /^\\/verk\\/[a-z0-9-]+\\/?$/.test(item.path));
    if (artworks.length) {
      return Array.from({ length: Math.min(limit, artworks.length) }, (_, i) =>
        artworks[(day * limit + i) % artworks.length].href);
    }
  }
  const picked: Candidate[] = [];
  for (const group of ["property", "editorial", "local", "other"]) {
    const candidate = groups.get(group)?.shift();
    if (candidate && picked.length < limit) picked.push(candidate);
  }
  if (picked.length < limit) {
    for (const group of ["property", "editorial", "local", "other"]) {
      for (const candidate of groups.get(group) || []) {
        if (picked.length >= limit) break;
        picked.push(candidate);
      }
    }
  }
  return picked.map(item => item.href);
}

export type SampledPage = {
  path: string; status: number | null; titlePresent: boolean | null;
  descriptionPresent: boolean | null; canonical: string | null;
  h1Count: number | null; noindex: boolean | null; issue: string | null;
};

export function inspectPublicSample(
  requestedUrl: string,
  snapshot: { url: string; status: number; contentType: string; body: string; xRobots: string },
  siteBase: string,
): SampledPage {
  const path = new URL(requestedUrl).pathname;
  const result: SampledPage = {
    path, status: snapshot.status, titlePresent: null, descriptionPresent: null,
    canonical: null, h1Count: null, noindex: null, issue: null,
  };
  if (snapshot.status !== 200 || !/text\/html/i.test(snapshot.contentType)) {
    result.issue = "Sitemap sample " + path + " returned HTTP " + snapshot.status + " or non-HTML; inspect the live public page";
    return result;
  }
  const html = snapshot.body;
  result.titlePresent = /<title(?:\s[^>]*)?>[\s\S]*?\S[\s\S]*?<\/title>/i.test(html);
  result.descriptionPresent = [...html.matchAll(/<meta\b[^>]*>/gi)].some(match =>
    /\bname\s*=\s*(?:"description"|'description'|description)(?:\s|>)/i.test(match[0]) &&
    /\bcontent\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)/i.test(match[0]));
  result.h1Count = [...html.matchAll(/<h1(?:\s|>)/gi)].length;
  const link = [...html.matchAll(/<link\b[^>]*>/gi)].find(match =>
    /\brel\s*=\s*(?:"canonical"|'canonical'|canonical)(?:\s|>)/i.test(match[0]));
  const href = link?.[0].match(/\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
  result.canonical = href ? (href[1] || href[2] || href[3]) : null;
  const robotsMeta = [...html.matchAll(/<meta\b[^>]*>/gi)].filter(match =>
    /\bname\s*=\s*(?:"robots"|'robots'|robots)(?:\s|>)/i.test(match[0]))
    .map(match => match[0]).join(" ");
  result.noindex = /\bnoindex\b/i.test(robotsMeta + " " + snapshot.xRobots);
  if (result.noindex) result.issue = "Sitemap sample " + path + " explicitly returns noindex";
  else if (!result.titlePresent) result.issue = "Sitemap sample " + path + " has no rendered HTML title";
  else if (result.h1Count === 0) result.issue = "Sitemap sample " + path + " has no server-rendered H1";
  else if (result.canonical) {
    try {
      const canonical = new URL(result.canonical, snapshot.url);
      const base = new URL(siteBase);
      if (canonical.protocol !== "https:") {
        result.issue = "Sitemap sample " + path + " has a non-HTTPS canonical; verify intent";
      } else if (!["www." + base.hostname.replace(/^www\./, ""), base.hostname.replace(/^www\./, "")].includes(canonical.hostname)) {
        result.issue = "Sitemap sample " + path + " has a cross-domain canonical; verify intent";
      } else {
        const normalized = (value: string) => value.replace(/\/+$/, "") || "/";
        const requestedPath = normalized(new URL(requestedUrl).pathname);
        const canonicalPath = normalized(canonical.pathname);
        if (canonicalPath !== requestedPath || canonical.search || canonical.hash) {
          result.issue = "Sitemap sample " + path + " has a canonical pointing to " +
            canonical.pathname + (canonical.search || "") +
            "; verify whether the declared sitemap URL should be indexed separately";
        }
      }
    } catch { result.issue = "Sitemap sample " + path + " has an invalid canonical URL"; }
  }
  return result;
}
