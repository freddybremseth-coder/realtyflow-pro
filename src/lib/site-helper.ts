export type SiteAnalysisInput = {
  companyName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  industry?: string | null;
  services?: string[];
  notes?: string | null;
};

export type SiteAnalysisResult = {
  source: "website_url" | "logo_url" | "manual_input";
  websiteUrl: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  brandColor: string;
  colorPalette: string[];
  industry: string;
  services: string[];
  notes: string | null;
};

export function normalizeWebsiteUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname.includes(".")) return null;
    if (
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function parseServiceList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function inferFaviconUrl(websiteUrl?: string | null) {
  if (!websiteUrl) return null;
  try {
    return new URL("/favicon.ico", websiteUrl).toString();
  } catch {
    return null;
  }
}

export function buildSiteAnalysis(input: SiteAnalysisInput): SiteAnalysisResult {
  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  const logoUrl = normalizeWebsiteUrl(input.logoUrl);
  const brandColor = input.brandColor || "#0f9f8f";

  return {
    source: websiteUrl ? "website_url" : logoUrl ? "logo_url" : "manual_input",
    websiteUrl,
    logoUrl,
    faviconUrl: inferFaviconUrl(websiteUrl),
    brandColor,
    colorPalette: [brandColor, "#0f172a", "#f8fafc", "#14b8a6"],
    industry: input.industry || "lokal bedrift",
    services: input.services || [],
    notes: input.notes || null,
  };
}
