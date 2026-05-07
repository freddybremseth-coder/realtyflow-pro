// ===== Ad Campaign Generator types =====

export type CampaignStatus =
  | "draft"
  | "brief_pending"
  | "matrix_pending"
  | "generating"
  | "completed"
  | "failed";

export type CreativeStatus = "pending" | "generating" | "completed" | "failed";

export type AspectRatio = "1:1" | "9:16" | "4:5" | "16:9";

export type Mood =
  | "bright/airy"
  | "moody/premium"
  | "minimal/clean"
  | "rustic/artisanal"
  | "bold/contrasty"
  | "vibrant/playful"
  | "editorial";

export interface CampaignBrief {
  bullets: string[];               // 8-10 strategic bullets
  top_angles: string[];            // 5 angle names this campaign uses
  hook_strategy: string;
  positioning_gap: string;
  sources: { title: string; url: string }[];
}

export interface SceneTemplate {
  id: string;                      // "A1", "B2", ...
  angle: string;
  mood: Mood;
  prompt_body: string;             // Contains {LABEL} placeholder
  market_lean?: string;
}

export interface CampaignMatrix {
  scenes: SceneTemplate[];         // 25 scenes
  mood_distribution: Record<string, number>;
  aspect_ratios: AspectRatio[];
  total_creatives: number;         // 50 by default
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
  brand_id: string | null;        // slug from BRANDS constant, e.g. "donaanna"
  user_id: string | null;

  name: string;
  product_name: string;
  product_image_url: string;
  label_description: string;
  target_markets: string[];        // e.g. ['ES', 'NO']
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

  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdCreative {
  id: string;
  campaign_id: string;

  scene_id: string;
  angle: string;
  mood: Mood | string | null;
  scene_description: string | null;
  aspect_ratio: AspectRatio;

  prompt: string;
  status: CreativeStatus;
  image_url: string | null;
  thumbnail_url: string | null;
  source_url: string | null;
  replicate_prediction_id: string | null;
  generation_seconds: number | null;
  error: string | null;

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

// ─── Brand template registry ─────────────────────────────────────
// Maps each brand type to its 5 angles + 25 scene templates.
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
  angles: string[];                // Always 5
  scenes: SceneTemplate[];         // Always 25 (5 per angle)
  default_moods: Mood[];
  caption_style_hint: string;      // For Claude when generating captions
}
