import { BRANDS } from "@/lib/constants";
import { growthBrandDefinition } from "@/lib/marketing/brand-registry";

const BRAND_ALIASES: Record<string, string> = {
  art: "freddyart",
  books: "freddypublishing",
  freddybremseth: "freddyb",
  remaster: "remasterfreddy",
};

const SOCIAL_CHANNELS = new Set([
  "facebook",
  "instagram",
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

export function socialChannelRequiresWebsite(channel: string) {
  return SOCIAL_CHANNELS.has(String(channel || "").trim().toLowerCase());
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
 * Every public social post for a configured brand must contain an owned-site
 * URL. A deep link on the same host satisfies the rule; otherwise the canonical
 * brand homepage is appended. Unknown/missing brand websites fail closed.
 */
export function ensureBrandWebsiteLink(input: {
  brandId: string;
  channel: string;
  content: string;
}): string {
  const content = String(input.content || "").trim();
  if (!socialChannelRequiresWebsite(input.channel)) return content;

  const website = canonicalBrandWebsite(input.brandId);
  if (!website) throw new Error(`SOCIAL_WEBSITE_URL_NOT_CONFIGURED:${input.brandId}`);
  if (contentHasBrandWebsite(content, website)) return content;
  return content ? `${content}\n\n${website}` : website;
}
