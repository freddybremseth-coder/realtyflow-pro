// ===== Ad Campaign Generator types =====

export type CampaignStatus =
  | "draft"
  | "brief_pending"
  | "matrix_pending"
  | "generating"
  | "completed"
  | "failed";

export type CreativeStatus = "pending" | "generating" | "completed" | "failed";
export type AdImageProvider = "auto" | "openart" | "gemini" | "flux" | "replicate";
export type AdCampaignStyle =
  | "product_focused"
  | "lifestyle"
  | "luxury"
  | "scandinavian_clean"
  | "organic_natural"
  | "seasonal"
  | "social_proof"
  | "promo_sale"
  | "mixed";
export type AdOverlayMode = "none" | "suggestions" | "automatic";

export type AspectRatio = "1:1" | "9:16" | "4:5" | "16:9" | "1.91:1";

export type Mood =
  | "bright/airy"
  | "moody/premium"
  | "minimal/clean"
  | "rustic/artisanal"
  | "bold/contrasty"
  | "vibrant/playful"
  | "editorial";

export interface CampaignBrief {
  bullets: string[];
  top_angles: string[];
  hook_strategy: string;
  positioning_gap: string;
  sources: { title: string; url: string }[];
}

export interface SceneTemplate {
  id: string;
  angle: string;
  mood: Mood;
  prompt_body: string;
  market_lean?: string;
}

export interface CampaignMatrix {
  scenes: SceneTemplate[];
  mood_distribution: Record<string, number>;
  aspect_ratios: AspectRatio[];
  total_creatives: number;
  concept_groups?: {
    id: string;
    angle: string;
    description: string;
  }[];
}

export interface ProviderStrategy {
  mode?: string;
  counts?: Record<string, number>;
  models?: Record<string, string>;
  estimatedCostUsd?: number;
  assumptions?: Record<string, number>;
}

export interface CampaignDelivery {
  top_picks: {
    creative_id: string;
    rank: number;
    rationale: string;
  }[];
  per_angle_captions: Record<string, {
    primary: string;
    secondary?: string;
    hashtags: string[];
  }>;
  reels_scripts: {
    creative_id: string;
    script: { time: string; visual: string; text: string; audio: string }[];
  }[];
  launch_recommendations: {
    daily_budget_eur: number;
    audience_segments: string[];
    metric_targets: { metric: string; target: string }[];
    refresh_cadence_days: number;
  };
}

export interface AdCampaign {
  id: string;
  brand_id: string | null;
  user_id: string | null;
  tenant_id?: string | null;

  name: string;
  product_name: string;
  product_image_url: string;
  label_description: string;
  target_markets: string[];
  audience_segments: string[];
  brand_voice: string | null;
  funnel_stage: "cold" | "warm" | string;
  offer: string | null;
  off_limits: string | null;

  status: CampaignStatus;
  brief: CampaignBrief | null;
  matrix: CampaignMatrix | null;
  delivery: CampaignDelivery | null;

  aspect_ratios: AspectRatio[] | null;
  total_creatives: number;
  succeeded_count: number;
  failed_count: number;
  estimated_cost_usd: number | null;

  image_provider: AdImageProvider;
  campaign_style: AdCampaignStyle;
  overlay_mode: AdOverlayMode;
  preserve_product_identity: boolean;
  provider_strategy: ProviderStrategy | null;
  concept_count: number;
  variants_per_concept: number;

  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdCreative {
  id: string;
  campaign_id: string;

  scene_id: string;
  angle: string;
  concept_group: string | null;
  variant_index: number;
  mood: Mood | string | null;
  scene_description: string | null;
  aspect_ratio: AspectRatio;

  prompt: string;
  provider: "openart" | "gemini" | "flux" | null;
  model: string | null;
  provider_job_id: string | null;
  status: CreativeStatus;
  image_url: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  replicate_prediction_id: string | null;
  output_asset_id: string | null;
  generation_seconds: number | null;
  error: string | null;

  overlay_headline: string | null;
  overlay_subheadline: string | null;
  overlay_cta: string | null;
  overlay_badge: string | null;
  overlay_applied: boolean;
  metadata_json: Record<string, unknown> | null;

  caption_primary: string | null;
  caption_secondary: string | null;
  hashtags: string[];
  is_top_pick: boolean;
  pick_rank: number | null;
  pushed_to_hub: boolean;
  hub_content_id: string | null;

  created_at: string;
  updated_at: string;
}

export type BrandTemplateKey =
  | "real_estate"
  | "saas"
  | "agriculture"
  | "personal"
  | "music"
  | "tourism"
  | "ecommerce";

export interface BrandTemplate {
  key: BrandTemplateKey;
  angles: string[];
  scenes: SceneTemplate[];
  default_moods: Mood[];
  caption_style_hint: string;
}
