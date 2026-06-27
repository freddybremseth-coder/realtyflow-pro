export type DemoSitesProfileInput = {
  companyName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  industry?: string | null;
  services?: string[];
  notes?: string | null;
};

export type DemoSitesProfile = {
  mode: "manual_demo_seed";
  source: "website_url" | "logo_url" | "manual_input";
  website_url: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  brand_color: string;
  color_palette: string[];
  industry: string;
  services: string[];
  notes: string | null;
  next_automation_steps: string[];
};

export function normalizePublicUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
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

export function parseServices(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

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

export function buildDemoSitesProfile(input: DemoSitesProfileInput): DemoSitesProfile {
  const websiteUrl = normalizePublicUrl(input.websiteUrl);
  const logoUrl = normalizePublicUrl(input.logoUrl);
  const brandColor = input.brandColor || "#0f9f8f";

  return {
    mode: "manual_demo_seed",
    source: websiteUrl ? "website_url" : logoUrl ? "logo_url" : "manual_input",
    website_url: websiteUrl,
    logo_url: logoUrl,
    favicon_url: inferFaviconUrl(websiteUrl),
    brand_color: brandColor,
    color_palette: [brandColor, "#0f172a", "#f8fafc", "#14b8a6"],
    industry: input.industry || "lokal bedrift",
    services: input.services || [],
    notes: input.notes || null,
    next_automation_steps: [
      "Read public website metadata",
      "Detect logo and brand colors",
      "Extract services, opening hours and contact details",
      "Generate preview content from selected DemoSites template",
    ],
  };
}
