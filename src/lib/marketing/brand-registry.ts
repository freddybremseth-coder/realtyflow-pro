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
  website: string;
  /** Channels that can currently use the controlled Growth OS pilot path. */
  pilotChannels: MarketingChannel[];
  /** Desired channel footprint. A channel may be planned before it is connected. */
  plannedChannels: MarketingChannel[];
  contentPillars?: readonly string[];
  conversionGoals?: readonly string[];
  primaryCtas?: readonly string[];
  notes?: string;
}

/** Canonical owned-brand registry for Marketing Growth OS. */
export const OWNED_GROWTH_BRANDS: readonly GrowthBrandDefinition[] = [
  {
    id: "zeneco",
    name: "Zen Eco Homes",
    kind: "real_estate",
    website: "https://zenecohomes.com",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook", "website", "email"],
    contentPillars: ["property_showcase", "area_and_lifestyle", "buyer_education", "new_build", "investment_and_value"],
    conversionGoals: ["property_lead", "viewing_request", "guide_download", "website_visit"],
    primaryCtas: ["view_property", "book_viewing", "contact", "download_guide"],
    notes: "Inventory-grounded property marketing. Property facts must come from canonical inventory and material outbound changes remain approval-gated.",
  },
  {
    id: "pinosoecolife",
    name: "Pinoso EcoLife",
    kind: "real_estate",
    website: "https://pinosoecolife.com",
    pilotChannels: ["facebook"],
    plannedChannels: ["instagram", "facebook", "website", "email"],
    contentPillars: ["rural_property", "new_build", "land_and_plot", "inland_lifestyle", "sustainable_living"],
    conversionGoals: ["property_lead", "viewing_request", "plot_enquiry", "website_visit"],
    primaryCtas: ["see_projects", "contact", "book_viewing", "request_plot_options"],
    notes: "Rural/inland property positioning with learning kept separate from Zen Eco Homes.",
  },
  {
    id: "donaanna",
    name: "Doña Anna",
    kind: "food_agriculture",
    website: "https://donaanna.com",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook", "youtube", "website", "email"],
    contentPillars: ["olive_oil", "farm_and_harvest", "food_and_use", "origin_and_craft", "olives_and_agriculture", "mediterranean_lifestyle"],
    conversionGoals: ["website_visit", "product_interest", "newsletter", "brand_awareness"],
    primaryCtas: ["visit_donaanna", "learn_more", "subscribe", "contact"],
    notes: "Doña Anna / donaanna.com is a full Growth OS brand. Food/agriculture content is allowed; health and medical claims require independent evidence and claim review.",
  },
  {
    id: "chatgenius",
    name: "ChatGenius.pro",
    kind: "saas",
    website: "https://chatgenius.pro",
    pilotChannels: ["instagram", "facebook"],
    plannedChannels: ["instagram", "facebook", "youtube", "linkedin", "website", "email"],
    contentPillars: ["product_demo", "ai_workflows", "problem_solution", "education", "subscription_apps", "small_business_websites", "business_ai_help"],
    conversionGoals: ["demo_request", "subscription", "website_lead", "consultation"],
    primaryCtas: ["see_demo", "start_subscription", "request_website", "contact"],
    notes: "Promote AI help for businesses, subscription-ready apps and affordable demo/web solutions. Specific features, pricing, integrations and outcome claims must be verified before publication.",
  },
  {
    id: "freddyb",
    name: "Freddy Bremseth",
    kind: "personal",
    website: "https://freddybremseth.com",
    pilotChannels: [],
    plannedChannels: ["instagram", "facebook", "linkedin", "youtube", "website", "email"],
    contentPillars: [
      "author_and_books",
      "book_launches_and_samples",
      "book_ads_and_reading",
      "spain_and_property_advisory",
      "analysis_knowledge_and_entrepreneurship",
      "ai_and_business_building",
    ],
    conversionGoals: ["book_sale", "book_page_visit", "sample_read", "author_follow", "website_visit"],
    primaryCtas: ["read_sample", "view_book", "buy_book", "visit_books_site", "follow"],
    notes: "freddybremseth.com is the primary personal/author brand. Books should be promoted to social channels with links to the owned book site; Instagram/Facebook remain planned until accounts are connected and write-governance is verified.",
  },
  {
    id: "remasterfreddy",
    name: "Re-Master Freddy",
    kind: "creator_media",
    website: "https://freddybremseth.com",
    pilotChannels: [],
    plannedChannels: ["youtube", "instagram", "facebook", "website"],
    contentPillars: ["song_release", "music_video", "youtube_catalog", "creative_process", "short_form_music", "website_discovery"],
    conversionGoals: ["youtube_view", "subscriber", "website_visit", "social_follow"],
    primaryCtas: ["watch_on_youtube", "subscribe", "visit_site", "follow"],
    notes: "Push original/authorized Re-Master Freddy songs, YouTube videos, website and social profiles. Never infer ownership or licensing of third-party media. Meta channels remain planned until connected.",
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
