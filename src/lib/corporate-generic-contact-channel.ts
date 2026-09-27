import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";

export type GenericCompanyContactChannel = {
  website_url: string;
  checked_at: string;
  generic_email: string | null;
  contact_page_url: string | null;
  pages_checked: string[];
  warnings: string[];
  company_level_only: true;
  personal_data_collected: false;
  outreach_started: false;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 700_000;
const MAX_REDIRECTS = 3;
const GENERIC_LOCAL_PARTS = [
  "post",
  "info",
  "kontakt",
  "contact",
  "hello",
  "hei",
  "firmapost",
  "office",
  "admin",
  "kundeservice",
  "service",
  "resepsjon",
  "reception",
  "salg",
  "sales",
  "booking",
  "support",
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&commat;/gi, "@")
    .replace(/&#64;/g, "@")
    .replace(/&#x40;/gi, "@")
    .replace(/&#46;/g, ".")
    .replace(/&#x2e;/gi, ".");
}

function sameCompanyHost(a: string, b: string) {
  const normalize = (value: string) => value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
  return normalize(a) === normalize(b);
}

export function isGenericCompanyEmail(value: string) {
  const email = String(value || "").trim().toLowerCase();
  const match = email.match(/^([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!match) return false;
  const local = match[1];
  return GENERIC_LOCAL_PARTS.some((prefix) =>
    local === prefix ||
    local.startsWith(prefix + ".") ||
    local.startsWith(prefix + "-") ||
    local.startsWith(prefix + "_"),
  );
}

function extractGenericEmails(html: string) {
  const decoded = decodeHtml(html);
  const values = new Set<string>();

  for (const match of decoded.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const email = String(match[1] || "").trim().toLowerCase();
    if (isGenericCompanyEmail(email)) values.add(email);
  }

  for (const match of decoded.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
    const email = String(match[0] || "").trim().toLowerCase();
    if (isGenericCompanyEmail(email)) values.add(email);
  }

  return [...values];
}

function contactLinks(html: string, baseUrl: string, host: string) {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b[^>]+href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const raw = String(match[1] || match[2] || match[3] || "").trim();
    if (!raw) continue;
    let url: URL;
    try {
      url = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(url.protocol)) continue;
    if (!sameCompanyHost(url.hostname, host)) continue;
    if (!/(kontakt|contact|om-oss|about)/i.test(url.pathname)) continue;
    url.hash = "";
    const clean = url.toString();
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
    if (out.length >= 8) break;
  }

  return out;
}

async function fetchHtml(initialUrl: string, startHost: string) {
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
        "User-Agent": "RealtyFlow-CorporateHomes-GenericContact/1.0",
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
    return {
      url: current,
      html: (await response.text()).slice(0, MAX_HTML_BYTES),
    };
  }

  return null;
}

export async function researchGenericCompanyContactChannel(websiteUrl: string): Promise<GenericCompanyContactChannel> {
  const safeStart = String(await validatePublicWebsiteUrl(websiteUrl));
  const host = new URL(safeStart).hostname;
  const warnings: string[] = [];
  const pagesChecked: string[] = [];
  const emails: string[] = [];

  let home: Awaited<ReturnType<typeof fetchHtml>> = null;
  try {
    home = await fetchHtml(safeStart, host);
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "Kunne ikke lese selskapets nettside.");
  }

  if (!home) {
    return {
      website_url: safeStart,
      checked_at: new Date().toISOString(),
      generic_email: null,
      contact_page_url: null,
      pages_checked: [],
      warnings,
      company_level_only: true,
      personal_data_collected: false,
      outreach_started: false,
    };
  }

  pagesChecked.push(home.url);
  emails.push(...extractGenericEmails(home.html));

  const links = contactLinks(home.html, home.url, host);
  let contactPageUrl: string | null = links[0] || null;

  if (links[0]) {
    try {
      const contactPage = await fetchHtml(links[0], host);
      if (contactPage) {
        pagesChecked.push(contactPage.url);
        contactPageUrl = contactPage.url;
        emails.push(...extractGenericEmails(contactPage.html));
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "Kunne ikke lese selskapets kontaktside.");
    }
  }

  const uniqueEmails = [...new Set(emails.map((email) => email.toLowerCase()))];
  return {
    website_url: safeStart,
    checked_at: new Date().toISOString(),
    generic_email: uniqueEmails[0] || null,
    contact_page_url: contactPageUrl,
    pages_checked: pagesChecked,
    warnings: [...new Set(warnings)].slice(0, 5),
    company_level_only: true,
    personal_data_collected: false,
    outreach_started: false,
  };
}
