import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";

export type CorporateCompanySignal =
  | "employee_benefit_signal"
  | "remote_workforce_signal"
  | "retreat_signal"
  | "existing_cabin_signal";

export type CorporateSignalEvidence = {
  source_url: string;
  matched_terms: string[];
  checked_at: string;
};

export type CorporateCompanySignalResearch = {
  website_url: string;
  checked_at: string;
  pages_checked: string[];
  signals: Partial<Record<CorporateCompanySignal, CorporateSignalEvidence>>;
  warnings: string[];
  personal_data_collected: false;
};

const SIGNAL_PATTERNS: Record<CorporateCompanySignal, RegExp[]> = {
  employee_benefit_signal: [
    /\bansattgoder?\b/i,
    /\bpersonalgoder?\b/i,
    /\bmedarbeiderfordeler?\b/i,
    /\bfordeler\s+for\s+ansatte\b/i,
    /\bemployee\s+benefits?\b/i,
    /\bstaff\s+benefits?\b/i,
    /\bemployee\s+perks?\b/i,
    /\bbenefits\s+package\b/i,
  ],
  remote_workforce_signal: [
    /\bhjemmekontor\b/i,
    /\bfjernarbeid\b/i,
    /\bhybrid(?:arbeid|\s+arbeid|\s+work)\b/i,
    /\bfleksibelt\s+arbeidssted\b/i,
    /\bremote\s+work(?:ing)?\b/i,
    /\bwork\s+from\s+anywhere\b/i,
    /\bdistributed\s+(?:team|workforce)\b/i,
  ],
  retreat_signal: [
    /\bfirmatur\b/i,
    /\bteambuilding\b/i,
    /\bteam\s+building\b/i,
    /\bkick[- ]?off\b/i,
    /\bcompany\s+retreat\b/i,
    /\bteam\s+retreat\b/i,
    /\boff[- ]?site\b/i,
    /\bbedriftssamling(?:er)?\b/i,
    /\bteamsamling(?:er)?\b/i,
  ],
  existing_cabin_signal: [
    /\bfirmahytte\b/i,
    /\bbedriftshytte\b/i,
    /\bpersonalhytte\b/i,
    /\bansatthytte\b/i,
    /\bcompany\s+cabin\b/i,
    /\bstaff\s+cabin\b/i,
    /\bemployee\s+holiday\s+home\b/i,
    /\breisegoder?\b/i,
    /\btravel\s+benefits?\b/i,
  ],
};

const PAGE_HINT_PATTERN =
  /karriere|jobb|jobbe-hos|people|career|culture|kultur|fordel|benefit|ansatt|employee|about|om-oss|baerekraft|sustainability|nyheter|news/i;

const MAX_PAGES = 4;
const MAX_HTML_BYTES = 700_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

function visibleText(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCompanyHost(a: string, b: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return normalize(a) === normalize(b);
}

function cleanPageUrl(value: string, base: string, host: string) {
  try {
    const parsed = new URL(value, base);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (!sameCompanyHost(parsed.hostname, host)) return null;
    if (/\.(pdf|jpe?g|png|webp|svg|zip|mp4|mp3|xml)$/i.test(parsed.pathname)) return null;
    if (/\b(?:login|logout|account|checkout|cart|booking|token|session)\b/i.test(parsed.pathname + parsed.search)) return null;
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function linksFromHtml(html: string, pageUrl: string, host: string) {
  const links: string[] = [];
  const seen = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]+href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const candidate = cleanPageUrl(match[1] || match[2] || match[3] || "", pageUrl, host);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    links.push(candidate);
    if (links.length >= 80) break;
  }
  return links.sort((a, b) => Number(PAGE_HINT_PATTERN.test(b)) - Number(PAGE_HINT_PATTERN.test(a)));
}

function matchedTerms(text: string, patterns: RegExp[]) {
  const terms: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[0]) continue;
    const term = match[0].trim();
    if (!terms.some((existing) => existing.toLowerCase() === term.toLowerCase())) terms.push(term);
  }
  return terms.slice(0, 4);
}

async function safeFetchHtml(initialUrl: string, startHost: string) {
  let current = String(await validatePublicWebsiteUrl(initialUrl));

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const parsed = new URL(current);
    if (!sameCompanyHost(parsed.hostname, startHost)) return null;

    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RealtyFlow-CorporateHomes-SignalResearch/1.0",
      },
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) return null;
      const next = new URL(location, current);
      if (!sameCompanyHost(next.hostname, startHost)) return null;
      current = String(await validatePublicWebsiteUrl(next.toString()));
      continue;
    }

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("text/html")) return null;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return { url: current, html };
  }

  return null;
}

export async function researchCorporateCompanySignals(websiteUrl: string): Promise<CorporateCompanySignalResearch> {
  const safeStart = String(await validatePublicWebsiteUrl(websiteUrl));
  const startHost = new URL(safeStart).hostname;
  const queue = [safeStart];
  const visited = new Set<string>();
  const pagesChecked: string[] = [];
  const warnings: string[] = [];
  const signals: CorporateCompanySignalResearch["signals"] = {};

  while (queue.length && pagesChecked.length < MAX_PAGES) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);

    let page: Awaited<ReturnType<typeof safeFetchHtml>> = null;
    try {
      page = await safeFetchHtml(candidate, startHost);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Kunne ikke lese offentlig nettside.");
      continue;
    }
    if (!page) continue;

    pagesChecked.push(page.url);
    const text = visibleText(page.html).slice(0, 250_000);
    const checkedAt = new Date().toISOString();

    for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS) as Array<[CorporateCompanySignal, RegExp[]]>) {
      if (signals[signal]) continue;
      const terms = matchedTerms(text, patterns);
      if (!terms.length) continue;
      signals[signal] = {
        source_url: page.url,
        matched_terms: terms,
        checked_at: checkedAt,
      };
    }

    if (pagesChecked.length === 1) {
      const links = linksFromHtml(page.html, page.url, startHost).slice(0, 12);
      queue.push(...links);
    }
  }

  return {
    website_url: safeStart,
    checked_at: new Date().toISOString(),
    pages_checked: pagesChecked,
    signals,
    warnings: [...new Set(warnings)].slice(0, 5),
    personal_data_collected: false,
  };
}

export function signalEvidencePatch(research: CorporateCompanySignalResearch) {
  const patch: Record<string, unknown> = {
    company_signal_research: research,
  };
  for (const signal of Object.keys(SIGNAL_PATTERNS) as CorporateCompanySignal[]) {
    const evidence = research.signals[signal];
    if (evidence) patch[signal] = evidence.source_url;
  }
  return patch;
}
