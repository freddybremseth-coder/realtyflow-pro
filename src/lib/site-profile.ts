export type SiteProfileInput = {
  companyName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  industry?: string | null;
  services?: string[];
  notes?: string | null;
};

export type SiteProfile = {
  source: "website" | "logo" | "manual";
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
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    if (host === "localhost" || host.endsWith(".local")) return null;
    if (host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.")) return null;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return null;
    return url.toString();
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

export function getFaviconUrl(websiteUrl?: string | null) {
  if (!websiteUrl) return null;
  try {
    return new URL("/favicon.ico", websiteUrl).toString();
  } catch {
    return null;
  }
}

export function buildSiteProfile(input: SiteProfileInput): SiteProfile {
  const websiteUrl = normalizeWebsiteUrl(input.websiteUrl);
  const logoUrl = normalizeWebsiteUrl(input.logoUrl);
  const brandColor = input.brandColor || "#0f9f8f";

  return {
    source: websiteUrl ? "website" : logoUrl ? "logo" : "manual",
    websiteUrl,
    logoUrl,
    faviconUrl: getFaviconUrl(websiteUrl),
    brandColor,
    colorPalette: [brandColor, "#0f172a", "#f8fafc", "#14b8a6"],
    industry: input.industry || "lokal bedrift",
    services: input.services || [],
    notes: input.notes || null,
  };
}
