import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";

export type CorporateCompanySignal =
  | "employee_benefit_signal"
  | "remote_workforce_signal"
  | "retreat_signal"
  | "existing_cabin_signal"
  | "hiring_growth_signal"
  | "international_growth_signal"
  | "new_office_signal"
  | "leadership_change_signal"
  | "acquisition_signal"
  | "financial_strength_signal"
  | "cost_cutting_signal"
  | "restructuring_signal"
  | "member_benefit_signal"
  | "culture_employer_brand_signal";

export type CorporateSignalEvidence = {
  source_url: string;
  matched_terms: string[];
  checked_at: string;
  source_kind?: "company_web" | "company_pdf";
};

export type CorporateCompanySignalResearch = {
  website_url: string;
  checked_at: string;
  pages_checked: string[];
  documents_checked?: Array<{ url: string; kind: "company_web" | "company_pdf" }>;
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
    /\bledersamling(?:er)?\b/i,
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
  hiring_growth_signal: [
    /\bvi\s+vokser\b/i,
    /\bvekst\s+i\s+antall\s+ansatte\b/i,
    /\bflere\s+ansatte\b/i,
    /\bnyansettelser?\b/i,
    /\brekrutterer\b/i,
    /\bwe\s+are\s+hiring\b/i,
    /\bgrowing\s+(?:team|workforce)\b/i,
    /\bheadcount\s+growth\b/i,
  ],
  international_growth_signal: [
    /\binternasjonal\s+vekst\b/i,
    /\bekspanderer\s+internasjonalt\b/i,
    /\bnye\s+markeder\b/i,
    /\bglobal\s+expansion\b/i,
    /\binternational\s+expansion\b/i,
    /\bentering\s+new\s+markets\b/i,
  ],
  new_office_signal: [
    /\bnytt\s+kontor\b/i,
    /\båpner\s+(?:et\s+)?kontor\b/i,
    /\bnew\s+office\b/i,
    /\bopens?\s+(?:a\s+)?new\s+office\b/i,
    /\bnew\s+location\b/i,
  ],
  leadership_change_signal: [
    /\bny\s+(?:administrerende\s+direktør|daglig\s+leder|ceo|cfo|hr[- ]?direktør)\b/i,
    /\btiltrer\s+som\b/i,
    /\bappointed\s+(?:as\s+)?(?:ceo|cfo|chief|director)\b/i,
    /\bnew\s+(?:ceo|cfo|chief\s+people\s+officer|hr\s+director)\b/i,
  ],
  acquisition_signal: [
    /\boppkjøp\b/i,
    /\bkjøper\s+opp\b/i,
    /\bfusjon\b/i,
    /\bacquisition\b/i,
    /\bacquires?\b/i,
    /\bmerger\b/i,
  ],
  financial_strength_signal: [
    /\brekordresultat\b/i,
    /\brekordomsetning\b/i,
    /\bsterk\s+vekst\b/i,
    /\bsolid\s+resultat\b/i,
    /\brecord\s+revenue\b/i,
    /\brecord\s+results?\b/i,
    /\bstrong\s+growth\b/i,
    /\bprofitable\s+growth\b/i,
  ],
  cost_cutting_signal: [
    /\bkostnadskutt\b/i,
    /\bkostnadsreduksjon\b/i,
    /\bspareprogram\b/i,
    /\bcost\s+cut(?:ting|s)?\b/i,
    /\bcost\s+reduction\b/i,
    /\befficiency\s+programme\b/i,
  ],
  restructuring_signal: [
    /\bnedbemanning\b/i,
    /\bpermitter\b/i,
    /\bomorganisering\b/i,
    /\brestrukturering\b/i,
    /\blayoffs?\b/i,
    /\brestructuring\b/i,
    /\breorganisation\b/i,
  ],
  member_benefit_signal: [
    /\bmedlemsfordeler?\b/i,
    /\bfordeler\s+for\s+medlemmer\b/i,
    /\bmember\s+benefits?\b/i,
    /\bmembership\s+benefits?\b/i,
  ],
  culture_employer_brand_signal: [
    /\bemployer\s+branding\b/i,
    /\barbeidsgiverprofil\b/i,
    /\bmedarbeideropplevelse\b/i,
    /\bemployee\s+experience\b/i,
    /\bpeople\s+strategy\b/i,
    /\bkultur\s+og\s+verdier\b/i,
  ],
};

const PAGE_HINT_PATTERN =
  /karriere|jobb|jobbe-hos|people|career|culture|kultur|fordel|benefit|ansatt|employee|about|om-oss|baerekraft|sustainability|nyheter|news|presse|press|investor|rapport|report|annual|årsrapport|strategi|strategy|resultat|result/i;

const MAX_PAGES = 8;
const MAX_HTML_BYTES = 900_000;
const MAX_PDF_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 12_000;
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
    if (/\.(jpe?g|png|webp|svg|zip|mp4|mp3|xml)$/i.test(parsed.pathname)) return null;
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
    if (links.length >= 120) break;
  }
  return links.sort((a, b) => {
    const bPdf = /\.pdf(?:$|\?)/i.test(b) ? 2 : 0;
    const aPdf = /\.pdf(?:$|\?)/i.test(a) ? 2 : 0;
    return (bPdf + Number(PAGE_HINT_PATTERN.test(b))) - (aPdf + Number(PAGE_HINT_PATTERN.test(a)));
  });
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

export function detectCorporateCompanySignals(
  text: string,
  sourceUrl: string,
  checkedAt = new Date().toISOString(),
  sourceKind: "company_web" | "company_pdf" = "company_web",
) {
  const signals: Partial<Record<CorporateCompanySignal, CorporateSignalEvidence>> = {};
  for (const [signal, patterns] of Object.entries(SIGNAL_PATTERNS) as Array<[CorporateCompanySignal, RegExp[]]>) {
    const terms = matchedTerms(text, patterns);
    if (!terms.length) continue;
    signals[signal] = {
      source_url: sourceUrl,
      matched_terms: terms,
      checked_at: checkedAt,
      source_kind: sourceKind,
    };
  }
  return signals;
}

async function extractPdfText(buffer: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buffer);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n\n") : String(text || "");
}

type FetchedDocument =
  | { url: string; kind: "company_web"; html: string; text: string }
  | { url: string; kind: "company_pdf"; text: string };

async function safeFetchDocument(initialUrl: string, startHost: string): Promise<FetchedDocument | null> {
  let current = String(await validatePublicWebsiteUrl(initialUrl));

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const parsed = new URL(current);
    if (!sameCompanyHost(parsed.hostname, startHost)) return null;

    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml,application/pdf",
        "User-Agent": "RealtyFlow-CorporateIntelligence/2.0",
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
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const contentLength = Number(response.headers.get("content-length") || 0);

    if (contentType.includes("application/pdf") || /\.pdf(?:$|\?)/i.test(current)) {
      if (contentLength > MAX_PDF_BYTES) return null;
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (buffer.byteLength > MAX_PDF_BYTES) return null;
      const text = (await extractPdfText(buffer)).replace(/\s+/g, " ").trim().slice(0, 350_000);
      return text ? { url: current, kind: "company_pdf", text } : null;
    }

    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
    const html = (await response.text()).slice(0, MAX_HTML_BYTES);
    return { url: current, kind: "company_web", html, text: visibleText(html).slice(0, 300_000) };
  }

  return null;
}

export async function researchCorporateCompanySignals(websiteUrl: string): Promise<CorporateCompanySignalResearch> {
  const safeStart = String(await validatePublicWebsiteUrl(websiteUrl));
  const startHost = new URL(safeStart).hostname;
  const queue = [safeStart];
  const visited = new Set<string>();
  const pagesChecked: string[] = [];
  const documentsChecked: CorporateCompanySignalResearch["documents_checked"] = [];
  const warnings: string[] = [];
  const signals: CorporateCompanySignalResearch["signals"] = {};

  while (queue.length && pagesChecked.length < MAX_PAGES) {
    const candidate = queue.shift();
    if (!candidate || visited.has(candidate)) continue;
    visited.add(candidate);

    let page: FetchedDocument | null = null;
    try {
      page = await safeFetchDocument(candidate, startHost);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Kunne ikke lese offentlig nettside eller dokument.");
      continue;
    }
    if (!page) continue;

    pagesChecked.push(page.url);
    documentsChecked.push({ url: page.url, kind: page.kind });
    const checkedAt = new Date().toISOString();

    const detected = detectCorporateCompanySignals(page.text, page.url, checkedAt, page.kind);
    for (const [signal, evidence] of Object.entries(detected) as Array<[CorporateCompanySignal, CorporateSignalEvidence]>) {
      if (!signals[signal]) signals[signal] = evidence;
    }

    if (page.kind === "company_web") {
      const links = linksFromHtml(page.html, page.url, startHost)
        .filter((url) => PAGE_HINT_PATTERN.test(url) || /\.pdf(?:$|\?)/i.test(url))
        .slice(0, 28);
      queue.push(...links);
    }
  }

  return {
    website_url: safeStart,
    checked_at: new Date().toISOString(),
    pages_checked: pagesChecked,
    documents_checked: documentsChecked,
    signals,
    warnings: [...new Set(warnings)].slice(0, 8),
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
