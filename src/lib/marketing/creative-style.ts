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

const CHANNEL_POOLS: Partial<Record<MarketingChannel, PropertyCreativeStyle[]>> = {
  facebook: ["hero_property", "fact_card", "lifestyle", "question_hook", "advisor", "minimal_premium", "carousel"],
  instagram: ["lifestyle", "minimal_premium", "carousel", "hero_property", "question_hook", "fact_card", "advisor"],
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

export function creativeStyleInstruction(value: string | null | undefined): string | null {
  return isStyle(value) ? STYLE_INSTRUCTIONS[value] : null;
}

export function selectPropertyCreativeStyle(input: {
  channel: MarketingChannel;
  seed: string;
  favoredStyle?: string | null;
  recentStyles?: string[];
}): PropertyCreativeStyle {
  if (isStyle(input.favoredStyle)) return input.favoredStyle;

  const pool = CHANNEL_POOLS[input.channel] ?? PROPERTY_CREATIVE_STYLES.slice();
  const recent = new Set((input.recentStyles ?? []).filter(isStyle));
  const fresh = pool.filter((style) => !recent.has(style));
  const candidates = fresh.length ? fresh : pool;
  return candidates[hashSeed(`${input.channel}|${input.seed}`) % candidates.length];
}
