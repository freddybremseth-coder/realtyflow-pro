import { BRANDS } from "@/lib/constants";
import { growthBrandDefinition } from "@/lib/marketing/brand-registry";

const BRAND_ALIASES: Record<string, string> = {
  art: "freddyart",
  books: "freddypublishing",
  freddybremseth: "freddyb",
  remaster: "remasterfreddy",
};

const WEBSITE_LINK_CHANNELS = new Set([
  "facebook",
  "linkedin",
  "youtube",
  "tiktok",
  "pinterest",
  "twitter",
  "x",
]);

function normalizedBrandId(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  return BRAND_ALIASES[raw] || raw;
}

function normalizedHost(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function canonicalBrandWebsite(brandId: string): string | null {
  const id = normalizedBrandId(brandId);
  const growth = growthBrandDefinition(id);
  const fallback = BRANDS.find((brand) => brand.id === id);
  const website = String(growth?.website || fallback?.website || "").trim().replace(/\/+$/, "");
  return website.startsWith("https://") ? website : null;
}

export function instagramCaptionWithoutLinks(content: string) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => !/\b(?:lenke|link)\s+i\s+(?:bio|profil(?:en)?)\b/i.test(line))
    .map((line) => line.replace(/https?:\/\/[^\s<>"']+/gi, "").replace(/\s+([,.;!?])/g, "$1").trim())
    .map((line) => line.replace(/:\s*$/, ""))
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function socialChannelRequiresWebsite(channel: string) {
  return WEBSITE_LINK_CHANNELS.has(String(channel || "").trim().toLowerCase());
}

export function contentHasBrandWebsite(content: string, website: string) {
  const expected = normalizedHost(website);
  if (!expected) return false;
  const urls = String(content || "").match(/https?:\/\/[^\s<>"']+/gi) || [];
  return urls.some((raw) => {
    const candidate = raw.replace(/[),.;!?\]}]+$/, "");
    const host = normalizedHost(candidate);
    return host === expected;
  });
}

/**
 * Link policy is channel-native:
 * - Facebook/LinkedIn/etc. get an owned-site URL when missing.
 * - Organic Instagram captions stay URL-free; raw links and "link in bio"
 *   language are stripped because they are not useful as clickable caption CTAs.
 * Brands without a configured owned website are otherwise left unchanged.
 */
export function ensureBrandWebsiteLink(input: {
  brandId: string;
  channel: string;
  content: string;
}): string {
  const channel = String(input.channel || "").trim().toLowerCase();
  const content = String(input.content || "").trim();
  if (channel === "instagram") return instagramCaptionWithoutLinks(content);
  if (!socialChannelRequiresWebsite(channel)) return content;

  const website = canonicalBrandWebsite(input.brandId);
  if (!website) return content;
  if (contentHasBrandWebsite(content, website)) return content;
  return content ? `${content}\n\n${website}` : website;
}
