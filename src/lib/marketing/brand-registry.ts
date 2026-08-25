import type { MarketingChannel } from "./genome";

export type OwnedGrowthBrandId =
  | "zeneco"
  | "pinosoecolife"
  | "donaanna"
  | "chatgenius"
  | "freddyb"
  | "remasterfreddy";

export interface GrowthBrandDefinition {
  id: OwnedGrowthBrandId;
  name: string;
  kind: "real_estate" | "food_agriculture" | "saas" | "personal" | "creator_media";
  /** Channels that can currently use the controlled Growth OS pilot path. */
  pilotChannels: MarketingChannel[];
  /** Connected/planned channels that are not necessarily pilot-ready yet. */
  plannedChannels: MarketingChannel[];
  contentPillars?: readonly string[];
  notes?: string;
}

/**
 * Canonical owned-brand registry for Marketing Growth OS.
 *
 * Important:
 * - Soleada is intentionally NOT here. Freddy works for Soleada, but it is not
 *   one of his owned brands and must never inherit autonomous Growth OS rules.
 * - Legacy/internal identifiers such as `neuralbeat` are intentionally NOT
 *   canonical brand IDs. Re-Master Freddy is `remasterfreddy`.
 * - A channel being connected does not make it pilot-ready. YouTube and
 *   LinkedIn remain planned-only until write governance is brand-scoped and
 *   approval-gated through the Growth OS publication lifecycle.
 */
export const OWNED_GROWTH_BRANDS: readonly GrowthBrandDefinition[] = [
  {
    id: "zeneco",
    name: "Zen Eco Homes",
    kind: "real_estate",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook"],
    notes: "Inventory-grounded property marketing. Manual review required.",
  },
  {
    id: "pinosoecolife",
    name: "Pinoso EcoLife",
    kind: "real_estate",
    pilotChannels: ["facebook"],
    plannedChannels: ["facebook"],
    contentPillars: ["rural_property", "new_build", "land_and_plot", "inland_lifestyle"],
    notes: "Rural/inland property positioning with separate learning from ZenEco.",
  },
  {
    id: "donaanna",
    name: "Doña Anna",
    kind: "food_agriculture",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook", "youtube"],
    contentPillars: ["olive_oil", "farm_and_harvest", "food_and_use", "origin_and_craft"],
    notes: "Food/agriculture brand. Health and medical claims require independent evidence.",
  },
  {
    id: "chatgenius",
    name: "ChatGenius.pro",
    kind: "saas",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook", "youtube"],
    contentPillars: ["product_demo", "ai_workflows", "problem_solution", "education"],
    notes: "Specific features, integrations, pricing and outcome claims must be verified.",
  },
  {
    id: "freddyb",
    name: "Freddy Bremseth",
    kind: "personal",
    pilotChannels: [],
    plannedChannels: ["linkedin", "youtube"],
    contentPillars: [
      "author_and_books",
      "spain_and_property_advisory",
      "analysis_knowledge_and_entrepreneurship",
    ],
    notes: "One primary content pillar per post/video. LinkedIn and YouTube are connected/planned but not yet Growth OS pilot-ready.",
  },
  {
    id: "remasterfreddy",
    name: "Re-master Freddy",
    kind: "creator_media",
    pilotChannels: [],
    plannedChannels: ["youtube"],
    contentPillars: ["remaster", "audiovisual", "creative_process"],
    notes: "Never infer ownership/licensing of third-party media. YouTube connected but not yet Growth OS pilot-ready.",
  },
] as const;

export const OWNED_GROWTH_BRAND_IDS = OWNED_GROWTH_BRANDS.map((brand) => brand.id);

export function growthBrandDefinition(brandId: string): GrowthBrandDefinition | null {
  return OWNED_GROWTH_BRANDS.find((brand) => brand.id === brandId) ?? null;
}

export function isPilotChannel(brandId: string, channel: string): boolean {
  const brand = growthBrandDefinition(brandId);
  return !!brand && brand.pilotChannels.includes(channel as MarketingChannel);
}
