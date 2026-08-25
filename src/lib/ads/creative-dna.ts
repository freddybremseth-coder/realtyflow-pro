export type AdGrowthGoal =
  | "unspecified"
  | "lead_generation"
  | "follower_growth"
  | "direct_sales"
  | "retargeting"
  | "awareness";

const HOOK_FAMILY_BY_CONCEPT: Record<string, string> = {
  premium_hero: "authority",
  lifestyle_context: "aspiration",
  scandinavian_clean: "clarity",
  organic_natural: "authenticity",
  detail_craft: "specificity",
  health_wellness: "outcome",
  seasonal_moment: "timeliness",
  gift_luxury: "aspiration",
  social_proof: "trust",
  promo_offer: "offer",
};

function slug(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36) || "creative";
}

export function normalizeGrowthGoal(value: unknown): AdGrowthGoal {
  const goal = String(value || "").toLowerCase();
  if (["lead_generation", "follower_growth", "direct_sales", "retargeting", "awareness"].includes(goal)) {
    return goal as AdGrowthGoal;
  }
  return "unspecified";
}

export function creativeTrackingCode(args: {
  campaignId: string;
  conceptGroup: string;
  variantIndex: number;
}) {
  const campaign = String(args.campaignId).replace(/-/g, "").slice(0, 10).toLowerCase();
  return `rfad_${campaign}_${slug(args.conceptGroup)}_${Math.max(1, Math.round(args.variantIndex || 1))}`;
}

export function creativeFormatForAspectRatio(aspectRatio: unknown) {
  const ratio = String(aspectRatio || "");
  if (ratio === "9:16") return "image_vertical";
  if (ratio === "4:5") return "image_portrait";
  if (ratio === "1:1") return "image_square";
  return "image_other";
}

export function hookFamilyForConcept(conceptGroup: unknown) {
  return HOOK_FAMILY_BY_CONCEPT[String(conceptGroup || "")] || "unclassified";
}

export function buildCreativeDna(args: {
  campaign: Record<string, any>;
  creative: Record<string, any>;
}) {
  const { campaign, creative } = args;
  const growthGoal = normalizeGrowthGoal(campaign.growth_goal);
  const hookFamily = hookFamilyForConcept(creative.conceptGroup);
  const creativeFormat = creativeFormatForAspectRatio(creative.aspectRatio);
  const audienceSegments = Array.isArray(campaign.audience_segments) ? campaign.audience_segments.map(String) : [];
  const targetMarkets = Array.isArray(campaign.target_markets) ? campaign.target_markets.map(String) : [];

  return {
    schemaVersion: 1,
    growthGoal,
    conceptFamily: String(creative.conceptGroup || ""),
    hookFamily,
    angle: String(creative.angle || ""),
    mood: String(creative.mood || ""),
    creativeFormat,
    aspectRatio: String(creative.aspectRatio || ""),
    language: campaign.default_language ? String(campaign.default_language) : null,
    audienceSegments,
    targetMarkets,
    funnelStage: campaign.funnel_stage ? String(campaign.funnel_stage) : null,
    offer: campaign.offer ? String(campaign.offer) : null,
    headline: creative.overlayHeadline || null,
    subheadline: creative.overlaySubheadline || null,
    cta: creative.overlayCta || null,
    providerRequested: String(creative.provider || ""),
    modelRequested: String(creative.model || ""),
    promptVersion: "campaign-planner-v1",
    preserveProductIdentity: campaign.preserve_product_identity !== false,
    campaignStyle: campaign.campaign_style || "mixed",
  };
}

export function buildPaidCreativeUtm(args: {
  channel: string;
  campaignId: string;
  trackingCode: string;
}) {
  return {
    utm_source: String(args.channel),
    utm_medium: "paid_social",
    utm_campaign: String(args.campaignId),
    utm_content: String(args.trackingCode),
  };
}
