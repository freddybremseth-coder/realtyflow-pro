import type { MarketingChannel } from "./genome";

export const PROPERTY_CREATIVE_STYLES = [
  "hero_property",
  "lifestyle",
  "fact_card",
  "advisor",
  "carousel",
  "question_hook",
  "minimal_premium",
] as const;

export type PropertyCreativeStyle = (typeof PROPERTY_CREATIVE_STYLES)[number];

export const CREATIVE_VARIANT_BRANDS = ["zeneco", "pinosoecolife"] as const;
export type CreativeVariantBrandId = (typeof CREATIVE_VARIANT_BRANDS)[number];

const BRAND_CHANNEL_POOLS: Record<CreativeVariantBrandId, Partial<Record<MarketingChannel, PropertyCreativeStyle[]>>> = {
  zeneco: {
    facebook: ["hero_property", "lifestyle", "minimal_premium", "fact_card", "question_hook", "carousel", "advisor"],
    instagram: ["lifestyle", "minimal_premium", "hero_property", "carousel", "fact_card", "question_hook", "advisor"],
  },
  pinosoecolife: {
    facebook: ["fact_card", "hero_property", "question_hook", "lifestyle", "carousel", "advisor", "minimal_premium"],
    instagram: ["fact_card", "lifestyle", "hero_property", "carousel", "question_hook", "advisor", "minimal_premium"],
  },
};

const STYLE_INSTRUCTIONS: Record<PropertyCreativeStyle, string> = {
  hero_property: "Hero property: lead with the strongest verified property fact, keep the opening compact, and make place/price/property type immediately understandable.",
  lifestyle: "Lifestyle: use a warm, aspirational opening, but every property-specific lifestyle claim must still be supported by factSources. Prefer atmosphere over a long specification list.",
  fact_card: "Fact card: write for a visual facts layout. Use short factual phrases and prioritize verified bedrooms, bathrooms, area, plot, pool, parking, price and distance facts when present.",
  advisor: "Advisor: use a human, helpful adviser voice and make the next step feel personal. Do not imply the adviser owns or developed the property unless Brand Brain says so.",
  carousel: "Carousel: write a concise cover hook plus a caption that can support multiple property images. Do not invent slide contents or facts not present in factSources.",
  question_hook: "Question hook: open with one short question grounded in verified facts, then answer with concise property information and a direct CTA.",
  minimal_premium: "Minimal premium: use very little copy, restrained wording and no hype. Prefer place, property type, one standout verified fact and CTA.",
};

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function isStyle(value: string | null | undefined): value is PropertyCreativeStyle {
  return !!value && (PROPERTY_CREATIVE_STYLES as readonly string[]).includes(value);
}

export function isCreativeVariantBrand(brandId: string): brandId is CreativeVariantBrandId {
  return (CREATIVE_VARIANT_BRANDS as readonly string[]).includes(brandId);
}

export function creativeStyleInstruction(value: string | null | undefined): string | null {
  return isStyle(value) ? STYLE_INSTRUCTIONS[value] : null;
}

export function selectPropertyCreativeStyle(input: {
  brandId: string;
  channel: MarketingChannel;
  seed: string;
  favoredStyle?: string | null;
  recentStyles?: string[];
}): PropertyCreativeStyle | null {
  if (!isCreativeVariantBrand(input.brandId)) return null;

  const pool = BRAND_CHANNEL_POOLS[input.brandId][input.channel] ?? PROPERTY_CREATIVE_STYLES.slice();
  if (isStyle(input.favoredStyle) && pool.includes(input.favoredStyle)) return input.favoredStyle;

  const recent = new Set((input.recentStyles ?? []).filter(isStyle));
  const fresh = pool.filter((style) => !recent.has(style));
  const candidates = fresh.length ? fresh : pool;
  return candidates[hashSeed(`${input.brandId}|${input.channel}|${input.seed}`) % candidates.length];
}
