import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAdminSession } from "@/lib/admin-auth";
import { analyzeDemoSiteProfile, getDemoSiteTemplateDefaults, type DemoSiteFaqItem } from "@/lib/demosites";

type RequestBody = Record<string, unknown>;
type SupabaseClientLike = any;
type FetchLike = typeof fetch;
type DnsLookupResult = Array<{ address: string; family: number }>;
type DnsLookupLike = (hostname: string) => Promise<DnsLookupResult>;

type CrawledPage = {
  url: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  headings: string[];
  snippets: string[];
  links: string[];
  logoCandidates: string[];
  imageCandidates: string[];
  colorCandidates: string[];
  emails: string[];
  phones: string[];
  addressCandidates: string[];
};

type ImportedProfile = {
  company_name: string;
  website_url: string;
  title: string;
  description: string;
  summary: string;
  detected_industry: string;
  recommended_template_slug: string;
  logo_url: string;
  image_urls: string[];
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  services: string[];
  products: string[];
  prices: string[];
  trust_points: string[];
  faq: DemoSiteFaqItem[];
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  confidence_score: number;
  source_pages: string[];
};

const USER_AGENT = "RealtyFlow DemoSites Profile Import (+https://realtyflow.chatgenius.pro)";
const MAX_PAGES = 5;
const MAX_RESPONSE_BYTES = 500_000;
const FETCH_TIMEOUT_MS = 7_000;
const MAX_REDIRECTS = 3;
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "ip6-localhost",
  "ip6-loopback",
]);
const BLOCKED_FILE_EXTENSIONS = /\.(?:pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|gz|tar|mp3|mp4|mov|avi|webm|woff2?|ttf|eot)$/i;
const PROTECTED_SECONDARY_PAGE_WARNING = "Noen undersider var beskyttet og ble hoppet over.";
const PROTECTED_ACTION_QUERY_KEYS = new Set([
  "drupal_cbp_check",
  "login",
  "logout",
  "user",
  "account",
  "checkout",
  "cart",
  "session",
  "token",
]);
const PROTECTED_ACTION_PATH_PATTERN = /(?:^|\/)(?:login|logout|user|account|checkout|cart|handlekurv|kasse|min-side|my-account|booking|book-en-avtale|bestill|avtale)(?:\/|$)/i;
const OPTIONAL_IMPORT_COLUMNS = [
  "recommended_template_slug",
  "profile_import_status",
  "profile_imported_at",
  "import_confidence_score",
];

let fetchForTests: FetchLike | null = null;
let dnsLookupForTests: DnsLookupLike | null = null;
let supabaseFactoryForTests: (() => SupabaseClientLike | null) | null = null;

export function setProfileImportFetchForTests(fetcher: FetchLike | null) {
  fetchForTests = fetcher;
}

export function setProfileImportDnsLookupForTests(lookupFn: DnsLookupLike | null) {
  dnsLookupForTests = lookupFn;
}

export function setProfileImportSupabaseFactoryForTests(factory: (() => SupabaseClientLike | null) | null) {
  supabaseFactoryForTests = factory;
}

class ProfileImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function getFetch() {
  return fetchForTests || fetch;
}

function getSupabase() {
  if (supabaseFactoryForTests) return supabaseFactoryForTests();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function text(value: unknown, maxLength = 4000) {
  const output = String(value || "").trim().replace(/\s+/g, " ");
  return output ? output.slice(0, maxLength) : "";
}

function uniqueList(values: Array<string | null | undefined>, limit = 12) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const item = text(value, 1200);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }

  return output;
}

function addWarningOnce(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function asRequestText(body: RequestBody, snakeCase: string, camelCase: string, maxLength = 500) {
  return text(body[snakeCase] ?? body[camelCase], maxLength);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number(code);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : "";
    });
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrlForOutput(url: URL) {
  url.hash = "";
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) {
    url.port = "";
  }
  if (!url.pathname) url.pathname = "/";
  return url.toString();
}

function isBlockedHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/\.$/, "");
  return (
    BLOCKED_HOSTNAMES.has(lower) ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower.endsWith(".home") ||
    lower.endsWith(".test")
  );
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function isPrivateIp(address: string) {
  const mappedIpv4 = address.includes(".") ? address.slice(address.lastIndexOf(":") + 1) : "";
  if (mappedIpv4 && isIP(mappedIpv4) === 4) return isPrivateIpv4(mappedIpv4);
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) !== 6) return true;

  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("2001:db8")
  );
}

async function assertPublicDns(hostname: string) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new ProfileImportError("website_url must point to a public internet address.");
    return;
  }

  const resolver = dnsLookupForTests || (async (host: string) => dnsLookup(host, { all: true, verbatim: false }) as Promise<DnsLookupResult>);
  let records: DnsLookupResult = [];

  try {
    records = await resolver(hostname);
  } catch {
    throw new ProfileImportError("website_url hostname could not be resolved.");
  }

  if (!records.length || records.some((record) => isPrivateIp(record.address))) {
    throw new ProfileImportError("website_url must resolve to a public internet address.");
  }
}

export async function validatePublicWebsiteUrl(value: unknown) {
  const raw = text(value, 1200);
  if (!raw) throw new ProfileImportError("website_url is required.");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProfileImportError("website_url must be a valid URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new ProfileImportError("website_url must use http or https.");
  }
  if (url.username || url.password) {
    throw new ProfileImportError("website_url must not include credentials.");
  }
  if (url.port && !["80", "443"].includes(url.port)) {
    throw new ProfileImportError("website_url must use a standard public web port.");
  }
  if (isBlockedHostname(url.hostname) || (isIP(url.hostname) && isPrivateIp(url.hostname))) {
    throw new ProfileImportError("website_url must point to a public company website.");
  }

  await assertPublicDns(url.hostname);
  return normalizeUrlForOutput(url);
}

function getAttr(tag: string, attr: string) {
  const match = tag.match(new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] || match?.[2] || match?.[3] || "").trim();
}

function getMetaContent(html: string, key: string) {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const name = getAttr(tag, "name").toLowerCase();
    const property = getAttr(tag, "property").toLowerCase();
    if (name === key.toLowerCase() || property === key.toLowerCase()) return getAttr(tag, "content");
  }
  return "";
}

function resolveCandidateUrl(value: string, baseUrl: string) {
  const raw = decodeHtml(value || "").trim();
  if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:")) return "";

  try {
    const parsed = new URL(raw, baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    if (isBlockedHostname(parsed.hostname) || (isIP(parsed.hostname) && isPrivateIp(parsed.hostname))) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function isLikelyProtectedOrActionUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return true;
  }

  if (PROTECTED_ACTION_PATH_PATTERN.test(parsed.pathname)) return true;
  for (const key of parsed.searchParams.keys()) {
    const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, "_");
    if (PROTECTED_ACTION_QUERY_KEYS.has(normalizedKey)) return true;
  }

  const queryText = parsed.search.toLowerCase();
  return /\b(?:login|logout|account|checkout|cart|booking|token|session)\b/.test(queryText);
}

function htmlToVisibleLines(html: string) {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<(?:br|p|div|section|article|li|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  return uniqueList(
    decodeHtml(visible)
      .split(/\n+/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter((line) => line.length >= 18 && line.length <= 220)
      .filter((line) => !/(cookie|personvern|privacy|javascript|nettleser|©|copyright)/i.test(line)),
    80,
  );
}

function extractHtmlPage(html: string, pageUrl: string): CrawledPage {
  const title = stripTags(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = getMetaContent(html, "description");
  const ogTitle = getMetaContent(html, "og:title");
  const ogDescription = getMetaContent(html, "og:description");
  const ogImage = resolveCandidateUrl(getMetaContent(html, "og:image"), pageUrl);
  const themeColor = getMetaContent(html, "theme-color");
  const headings = uniqueList(
    [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) => stripTags(match[1])),
    16,
  );
  const snippets = htmlToVisibleLines(html);
  const logoCandidates: string[] = [];
  const imageCandidates: string[] = [];

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = getAttr(tag, "rel").toLowerCase();
    if (!/(icon|apple-touch-icon)/.test(rel)) continue;
    logoCandidates.push(resolveCandidateUrl(getAttr(tag, "href"), pageUrl));
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = resolveCandidateUrl(getAttr(tag, "src") || getAttr(tag, "data-src"), pageUrl);
    if (!src) continue;

    const descriptor = `${getAttr(tag, "alt")} ${getAttr(tag, "class")} ${src}`.toLowerCase();
    if (descriptor.includes("logo")) logoCandidates.push(src);
    if (!/(sprite|tracking|pixel|avatar|icon)/i.test(descriptor)) imageCandidates.push(src);
  }

  const links = uniqueList(
    [...html.matchAll(/<a\b[^>]*>/gi)]
      .map((match) => resolveCandidateUrl(getAttr(match[0], "href"), pageUrl))
      .filter((href) => {
        if (!href || BLOCKED_FILE_EXTENSIONS.test(new URL(href).pathname)) return false;
        return new URL(href).hostname === new URL(pageUrl).hostname;
      }),
    24,
  );
  const emails = uniqueList(html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [], 5);
  const phones = uniqueList(html.match(/(?:\+47\s*)?(?:\d[\s.-]?){8,14}/g) || [], 5).filter((phone) => phone.replace(/\D/g, "").length >= 8);
  const addressCandidates = snippets.filter((line) => /\b(gate|gata|veien|vegen|vei|street|adresse|address)\b/i.test(line)).slice(0, 4);
  const colorCandidates = uniqueList([
    themeColor,
    ...[...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((match) => match[0]),
  ], 8);

  return {
    url: pageUrl,
    title,
    description,
    ogTitle,
    ogDescription,
    headings,
    snippets: snippets.slice(0, 18),
    links,
    logoCandidates: uniqueList([...logoCandidates, ogImage], 8),
    imageCandidates: uniqueList([ogImage, ...imageCandidates], 12),
    colorCandidates,
    emails,
    phones,
    addressCandidates,
  };
}

async function readLimitedResponseText(response: Response) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new ProfileImportError("Website response is too large.", 413);
  if (!response.body) return (await response.text()).slice(0, MAX_RESPONSE_BYTES);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_RESPONSE_BYTES) throw new ProfileImportError("Website response is too large.", 413);
    output += decoder.decode(value, { stream: true });
  }

  output += decoder.decode();
  return output;
}

async function fetchHtml(
  url: string,
  warnings: string[],
  { isStartPage = false, redirectCount = 0 }: { isStartPage?: boolean; redirectCount?: number } = {},
): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await getFetch()(url, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
      },
    });

    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      if (redirectCount >= MAX_REDIRECTS) {
        warnings.push(`Too many redirects from ${url}.`);
        return null;
      }
      const nextUrl = await validatePublicWebsiteUrl(new URL(response.headers.get("location") || "", url).toString());
      return fetchHtml(nextUrl, warnings, { isStartPage, redirectCount: redirectCount + 1 });
    }

    if (!response.ok) {
      if (isStartPage && (response.status === 401 || response.status === 403)) {
        throw new ProfileImportError(`Startsiden kunne ikke hentes: HTTP ${response.status}.`, response.status);
      }
      if (!isStartPage && (response.status === 401 || response.status === 403)) {
        addWarningOnce(warnings, PROTECTED_SECONDARY_PAGE_WARNING);
        return null;
      }
      warnings.push(`Could not fetch ${url}: HTTP ${response.status}.`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      warnings.push(`Skipped non-HTML page ${url}.`);
      return null;
    }

    return { html: await readLimitedResponseText(response), finalUrl: response.url || url };
  } catch (error) {
    if (error instanceof ProfileImportError) throw error;
    warnings.push(error instanceof Error && error.name === "AbortError" ? `Timed out fetching ${url}.` : `Could not fetch ${url}.`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function crawlWebsite(startUrl: string, warnings: string[]) {
  const queue = [startUrl];
  const seen = new Set<string>();
  const pages: CrawledPage[] = [];
  const startHostname = new URL(startUrl).hostname;

  while (queue.length && pages.length < MAX_PAGES) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const isStartPage = current === startUrl && pages.length === 0;

    if (!isStartPage && isLikelyProtectedOrActionUrl(current)) {
      addWarningOnce(warnings, PROTECTED_SECONDARY_PAGE_WARNING);
      continue;
    }

    const fetched = await fetchHtml(current, warnings, { isStartPage });
    if (!fetched) continue;

    const finalUrl = await validatePublicWebsiteUrl(fetched.finalUrl);
    if (new URL(finalUrl).hostname !== startHostname) {
      warnings.push(`Skipped redirected page outside original hostname: ${finalUrl}.`);
      continue;
    }

    const page = extractHtmlPage(fetched.html, finalUrl);
    pages.push(page);

    for (const link of page.links) {
      if (pages.length + queue.length >= MAX_PAGES) break;
      if (isLikelyProtectedOrActionUrl(link)) {
        addWarningOnce(warnings, PROTECTED_SECONDARY_PAGE_WARNING);
        continue;
      }
      if (!seen.has(link) && new URL(link).hostname === startHostname) queue.push(link);
    }
  }

  if (!pages.length) throw new ProfileImportError("Could not fetch any public HTML pages from website_url.", 422);
  return pages;
}

function extractPrices(lines: string[]) {
  return uniqueList(
    lines.filter((line) => /\b(kr|nok|pris|pakke|fra\s+\d|,-)\b/i.test(line)).map((line) => line.slice(0, 140)),
    6,
  );
}

function extractServices(lines: string[]) {
  return uniqueList(
    lines
      .filter((line) => !/\b(cookie|personvern|kontakt|telefon|e-post|pris|kr|nok)\b/i.test(line))
      .filter((line) => line.length >= 18 && line.length <= 130)
      .slice(0, 20),
    8,
  );
}

function extractProducts(lines: string[]) {
  return uniqueList(
    lines
      .filter((line) => /\b(meny|pakke|produkt|dekk|felg|hjulhotell|eu-kontroll|service|lunsj|middag|takeaway|rom|behandling|befaring|tilbud)\b/i.test(line))
      .filter((line) => !/\b(cookie|personvern|kontakt|telefon|e-post)\b/i.test(line))
      .filter((line) => line.length >= 8 && line.length <= 120),
    6,
  );
}

function extractTrustPoints(lines: string[]) {
  return uniqueList(
    lines
      .filter((line) => /\b(autorisert|sertifisert|erfaring|trygg|kvalitet|lokal|rask|garanti|profesjonell|anbefalt)\b/i.test(line))
      .slice(0, 8),
    5,
  );
}

function extractFaq(lines: string[]) {
  return lines
    .filter((line) => line.includes("?"))
    .slice(0, 4)
    .map((question) => ({
      question: question.slice(0, 180),
      answer: "Dette kan avklares direkte med bedriften før kunden bestemmer seg.",
    }));
}

function normalizeListKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeUniqueLists(primary: string[], fallback: string[], limit = 8) {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of [...primary, ...fallback]) {
    const item = text(value, 160);
    const key = normalizeListKey(item);
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }

  return output;
}

function normalizeTemplateSlug(templateSlug: string) {
  const normalized = normalizeListKey(templateSlug).replace(/\s+/g, "-");
  if (normalized === "restaurant-cafe") return "restaurant";
  if (normalized === "bygg-anlegg") return "bygg";
  if (normalized === "rorlegger") return "rorlegger";
  if (normalized === "frisor") return "frisor";
  return normalized || "local-service";
}

function getIndustryCallToAction(templateSlug: string) {
  switch (normalizeTemplateSlug(templateSlug)) {
    case "dekk":
      return "Få tilbud på dekk";
    case "bilverksted":
      return "Bestill time";
    case "restaurant":
    case "kafe":
      return "Book bord";
    case "renhold":
      return "Få gratis befaring";
    case "elektro":
    case "rorlegger":
    case "snekker":
    case "bygg":
      return "Bestill befaring";
    case "hotell":
      return "Sjekk tilgjengelighet";
    case "eiendomsmegler":
      return "Bestill verdivurdering";
    default:
      return "";
  }
}

function getIndustryFallbackProducts(templateSlug: string) {
  switch (normalizeTemplateSlug(templateSlug)) {
    case "dekk":
    case "bilverksted":
      return ["Dekkskift", "Hjulhotell", "EU-kontroll / verkstedtjenester", "Dekk og felg"];
    case "restaurant":
    case "kafe":
      return ["Meny", "Lunsj og middag", "Bordbestilling", "Selskaper og grupper"];
    case "renhold":
      return ["Fast renhold", "Flyttevask", "Bedriftsrenhold", "Befaring og pristilbud"];
    case "hotell":
      return ["Rom og overnatting", "Frokost og fasiliteter", "Gruppeforespørsel", "Tilgjengelighet på dato"];
    case "eiendomsmegler":
      return ["Verdivurdering", "Salgsvurdering", "Boligsalg", "Rådgivning før salg"];
    default:
      return [];
  }
}

function getIndustryFallbackPrices(templateSlug: string) {
  switch (normalizeTemplateSlug(templateSlug)) {
    case "dekk":
    case "bilverksted":
      return [
        "Eksempel: Dekkskift - pris avklares med verkstedet",
        "Eksempel: Hjulhotell - pris avklares med verkstedet",
        "Eksempel: EU-kontroll / verkstedtjenester - pris avklares ved bestilling",
        "Eksempel: Dekk og felg - tilbud gis etter behov",
      ];
    case "restaurant":
    case "kafe":
      return ["Eksempel: Meny og grupper - pris avklares med stedet", "Eksempel: Bord eller arrangement - forespørsel sendes før bekreftelse"];
    case "renhold":
      return ["Eksempel: Befaring før fastpris", "Eksempel: Flyttevask eller fast renhold prises etter areal og behov"];
    default:
      return [];
  }
}

function pickCompanyName(inputCompanyName: string, pages: CrawledPage[]) {
  if (inputCompanyName) return inputCompanyName;
  const title = pages[0]?.ogTitle || pages[0]?.title || "";
  const cleaned = title
    .split("|")[0]
    .split(" - ")[0]
    .replace(/\b(hjem|forside|velkommen)\b/gi, "")
    .trim();
  return cleaned || "Bedriften";
}

function buildImportedProfile(input: { websiteUrl: string; companyName: string; pages: CrawledPage[] }): { profile: ImportedProfile; editableFields: Record<string, unknown> } {
  const pageText = input.pages
    .flatMap((page) => [page.title, page.description, page.ogTitle, page.ogDescription, ...page.headings, ...page.snippets])
    .join("\n");
  const companyName = pickCompanyName(input.companyName, input.pages);
  const analysis = analyzeDemoSiteProfile({
    companyName,
    websiteUrl: input.websiteUrl,
    industry: pageText,
    notes: pageText,
  });
  const defaults = getDemoSiteTemplateDefaults(analysis.templateSlug, companyName);
  const sourcePages = uniqueList(input.pages.map((page) => page.url), MAX_PAGES);
  const title = input.pages[0]?.ogTitle || input.pages[0]?.title || defaults.hero_title;
  const description = input.pages[0]?.ogDescription || input.pages[0]?.description || defaults.hero_subtitle;
  const lines = uniqueList(input.pages.flatMap((page) => [...page.headings, ...page.snippets]), 80);
  const services = extractServices(lines);
  const products = extractProducts(lines);
  const prices = extractPrices(lines);
  const trustPoints = extractTrustPoints(lines);
  const faq = extractFaq(lines);
  const logoCandidates = uniqueList(input.pages.flatMap((page) => page.logoCandidates), 8);
  const logoUrl = logoCandidates.find((candidate) => /logo/i.test(candidate)) || logoCandidates[0] || "";
  const imageUrls = uniqueList(input.pages.flatMap((page) => page.imageCandidates), 8);
  const colorCandidates = uniqueList(input.pages.flatMap((page) => page.colorCandidates), 3);
  const colors = {
    primary: colorCandidates[0] || defaults.brand_color,
    secondary: colorCandidates[1] || defaults.secondary_color,
    accent: colorCandidates[2] || defaults.accent_color,
  };
  const email = uniqueList(input.pages.flatMap((page) => page.emails), 1)[0] || "";
  const phone = uniqueList(input.pages.flatMap((page) => page.phones), 1)[0] || "";
  const address = uniqueList(input.pages.flatMap((page) => page.addressCandidates), 1)[0] || "";
  const confidenceScore = Math.min(
    100,
    Math.max(
      35,
      45 +
        (analysis.templateSlug !== "local-service" ? 20 : 0) +
        (description ? 10 : 0) +
        (services.length ? 10 : 0) +
        (logoUrl ? 5 : 0) +
        (imageUrls.length ? 5 : 0) +
        (email || phone ? 5 : 0),
    ),
  );
  const summary = description || lines[0] || defaults.intro_text;
  const industryCta = getIndustryCallToAction(analysis.templateSlug) || defaults.call_to_action;
  const fallbackProducts = getIndustryFallbackProducts(analysis.templateSlug);
  const fallbackPrices = getIndustryFallbackPrices(analysis.templateSlug);
  const profileServices = services.length ? mergeUniqueLists(services, [], 8) : defaults.services;
  const profileProducts = products.length
    ? mergeUniqueLists(products, fallbackProducts, 8)
    : fallbackProducts.length
      ? fallbackProducts
      : defaults.products;
  const profilePrices = prices.length
    ? mergeUniqueLists(prices, [], 6)
    : fallbackPrices.length
      ? fallbackPrices
      : defaults.prices;
  const profileTrustPoints = trustPoints.length ? mergeUniqueLists(trustPoints, [], 6) : defaults.trust_points;
  const profileFaq = faq.length ? faq : defaults.faq;

  const profile: ImportedProfile = {
    company_name: companyName,
    website_url: input.websiteUrl,
    title,
    description,
    summary,
    detected_industry: defaults.template_name,
    recommended_template_slug: analysis.templateSlug,
    logo_url: logoUrl,
    image_urls: imageUrls,
    colors,
    services: profileServices,
    products: profileProducts,
    prices: profilePrices,
    trust_points: profileTrustPoints,
    faq: profileFaq,
    contact: { email, phone, address },
    confidence_score: confidenceScore,
    source_pages: sourcePages,
  };

  const editableFields = {
    ...defaults,
    template_slug: profile.recommended_template_slug,
    hero_title: companyName ? `${companyName} - ${industryCta.toLowerCase()}` : defaults.hero_title,
    hero_subtitle: profile.description || defaults.hero_subtitle,
    intro_text: profile.summary || defaults.intro_text,
    services: profile.services,
    products: profile.products,
    prices: profile.prices,
    trust_points: profile.trust_points,
    faq: profile.faq,
    call_to_action: industryCta,
    contact_text: email || phone ? `Ta kontakt med ${companyName} for spørsmål, booking eller et konkret prisforslag.` : defaults.contact_text,
    logo_url: profile.logo_url,
    gallery_images: profile.image_urls.length ? profile.image_urls : defaults.gallery_images,
    brand_color: colors.primary,
    secondary_color: colors.secondary,
    accent_color: colors.accent,
    brand_colors: {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
    },
    contact_info: {
      company: companyName,
      email,
      phone,
      website: profile.website_url,
      address,
    },
    profile_import_requires_review: true,
    profile_import_source_pages: sourcePages,
    profile_import_field_sources: {
      hero_title: companyName ? "website" : "template",
      hero_subtitle: profile.description ? "website" : "template",
      intro_text: profile.summary ? "website" : "template",
      services: services.length ? "website" : "missing",
      products: products.length ? "website" : fallbackProducts.length ? "missing" : "template",
      prices: prices.length ? "website" : fallbackPrices.length ? "missing" : "template",
      trust_points: trustPoints.length ? "website" : "missing",
      faq: faq.length ? "website" : "missing",
      call_to_action: getIndustryCallToAction(analysis.templateSlug) ? "template" : "missing",
      contact_text: email || phone ? "website" : "template",
      logo_url: profile.logo_url ? "website" : "missing",
      gallery_images: profile.image_urls.length ? "website" : "template",
      brand_color: colorCandidates[0] ? "website" : "template",
      secondary_color: colorCandidates[1] ? "website" : "template",
      accent_color: colorCandidates[2] ? "website" : "template",
    },
  };

  return { profile, editableFields };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isOptionalColumnError(error: unknown) {
  const message = `${(error as { code?: string; message?: string })?.code || ""} ${(error as { message?: string })?.message || ""}`.toLowerCase();
  return OPTIONAL_IMPORT_COLUMNS.some((column) => message.includes(column)) || message.includes("schema cache");
}

async function updateOrderIfRequested(orderId: string, profile: ImportedProfile, editableFields: Record<string, unknown>, warnings: string[]) {
  if (!orderId) return;
  const supabase = getSupabase();
  if (!supabase) {
    warnings.push("Order was not updated because Supabase service credentials are not configured.");
    return;
  }

  const existing = await supabase.from("demo_site_orders").select("id, editable_fields").eq("id", orderId).maybeSingle();
  if (existing.error || !existing.data?.id) {
    warnings.push("Order was not updated because order_id could not be found.");
    return;
  }

  const currentFields = isPlainObject(existing.data.editable_fields) ? existing.data.editable_fields : {};
  const currentContact = isPlainObject(currentFields.contact_info) ? currentFields.contact_info : {};
  const nextContact = isPlainObject(editableFields.contact_info) ? editableFields.contact_info : {};
  const mergedEditableFields = {
    ...currentFields,
    ...editableFields,
    contact_info: {
      ...currentContact,
      ...nextContact,
    },
  };
  const basePatch = {
    extracted_profile: profile,
    editable_fields: mergedEditableFields,
    updated_at: new Date().toISOString(),
  };
  const importPatch = {
    ...basePatch,
    recommended_template_slug: profile.recommended_template_slug,
    profile_import_status: "needs_review",
    profile_imported_at: new Date().toISOString(),
    import_confidence_score: profile.confidence_score,
  };
  const firstUpdate = await supabase.from("demo_site_orders").update(importPatch).eq("id", orderId);

  if (!firstUpdate.error) return;
  if (!isOptionalColumnError(firstUpdate.error)) {
    warnings.push("Order profile import was analyzed, but the order update failed.");
    return;
  }

  const fallbackUpdate = await supabase.from("demo_site_orders").update(basePatch).eq("id", orderId);
  if (fallbackUpdate.error) {
    warnings.push("Order profile import was analyzed, but the fallback order update failed.");
  } else {
    warnings.push("Optional profile import columns are not present; saved extracted_profile and editable_fields only.");
  }
}

export async function POST(request: NextRequest) {
  const session = await verifyAdminSession(request.cookies.get("realtyflow_admin")?.value);
  if (!session) return NextResponse.json({ error: "Admin session required" }, { status: 401 });

  const warnings: string[] = [];

  try {
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const normalizedUrl = await validatePublicWebsiteUrl(body.website_url ?? body.websiteUrl);
    const companyName = asRequestText(body, "company_name", "companyName", 160);
    const orderId = asRequestText(body, "order_id", "orderId", 120);
    const pages = await crawlWebsite(normalizedUrl, warnings);
    const { profile, editableFields } = buildImportedProfile({ websiteUrl: normalizedUrl, companyName, pages });

    await updateOrderIfRequested(orderId, profile, editableFields, warnings);

    return NextResponse.json({
      profile,
      editable_fields: editableFields,
      warnings,
    });
  } catch (error) {
    if (error instanceof ProfileImportError) {
      return NextResponse.json({ error: error.message, warnings }, { status: error.status });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not import website profile", warnings },
      { status: 500 },
    );
  }
}
