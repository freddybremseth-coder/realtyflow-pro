// ─── Claude orchestration: Brief → Matrix → Captions → Top Picks ─────
// All Claude calls go through the existing askClaude helper which handles
// fallbacks (Gemini, OpenAI) automatically.

import { askClaude } from "@/services/ai/claude-client";
import { getBrandTemplate } from "./scene-templates";
import type {
  CampaignBrief,
  CampaignMatrix,
  SceneTemplate,
  AdCreative,
  AdCampaign,
} from "@/types/ads";

// Strip ```json fences and parse JSON safely
function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) cleaned = codeBlock[1].trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last-ditch: find the first {...} or [...] in the response
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) return JSON.parse(objMatch[0]) as T;
    throw new Error(`Failed to parse JSON from AI response: ${cleaned.slice(0, 300)}`);
  }
}


// ─── 1. Generate creative brief (Step 1) ───────────────────────────────
export interface BriefGenerationInput {
  product_name: string;
  brand_name: string;
  brand_type: string;
  brand_voice?: string | null;
  target_markets: string[];
  audience_segments: string[];
  funnel_stage: string;
  offer?: string | null;
}

export async function generateBrief(input: BriefGenerationInput): Promise<CampaignBrief> {
  const tmpl = getBrandTemplate(input.brand_type);
  const systemPrompt = `You are a senior performance-marketing strategist working on Instagram/Meta campaigns. You produce concise, evidence-aware creative briefs. Always respond with valid JSON matching the requested schema — no preamble, no markdown.`;

  const prompt = `Generate a creative brief for the following IG/Meta ad campaign.

Product: ${input.product_name}
Brand: ${input.brand_name} (type: ${input.brand_type})
Brand voice: ${input.brand_voice || "(unspecified — infer from brand type)"}
Target markets: ${input.target_markets.join(", ")}
Target audiences: ${input.audience_segments.join("; ")}
Funnel stage: ${input.funnel_stage}
Offer/CTA: ${input.offer || "(none specified)"}

Suggested 5 angles for this brand type: ${tmpl.angles.join(", ")}
Recommended moods: ${tmpl.default_moods.join(", ")}
Caption style hint: ${tmpl.caption_style_hint}

Return strict JSON with this schema:
{
  "bullets": [/* 8-10 strings, each a strategic insight specific to this product+market+audience */],
  "top_angles": [/* exactly 5 angle names, drawn from the suggested 5 unless something better fits */],
  "hook_strategy": "/* 1-2 sentences on the hook approach for first 2-3 seconds */",
  "positioning_gap": "/* 1-2 sentences on the white space vs competitors */",
  "sources": [/* up to 5 short {title,url} objects of relevant references — use empty array if none come to mind */]
}`;

  const text = await askClaude(prompt, {
    systemPrompt,
    maxTokens: 1500,
    temperature: 0.4,
  });
  return parseJsonResponse<CampaignBrief>(text);
}


// ─── 2. Build the matrix (Step 2) ──────────────────────────────────────
// Uses the brand template scenes. If `target_total` is given (and smaller
// than the full set), subsamples evenly across angles so each angle is
// represented. `aspect_ratios` chooses 1 or 2 ratios.
export interface BuildMatrixOptions {
  aspect_ratios?: ("1:1" | "9:16")[];
  target_total?: number;             // e.g. 10, 25, 50
}

export function buildMatrix(
  brandType: string,
  options: BuildMatrixOptions = {}
): CampaignMatrix {
  const tmpl = getBrandTemplate(brandType);
  const aspect_ratios = options.aspect_ratios && options.aspect_ratios.length > 0
    ? options.aspect_ratios
    : (["1:1", "9:16"] as ("1:1" | "9:16")[]);

  let scenes = tmpl.scenes;

  // If target_total set, pick a subset of scenes evenly across angles.
  if (options.target_total) {
    const scenesNeeded = Math.max(1, Math.ceil(options.target_total / aspect_ratios.length));
    if (scenesNeeded < scenes.length) {
      scenes = pickEvenlyAcrossAngles(scenes, scenesNeeded);
    }
  }

  const moodCount: Record<string, number> = {};
  for (const s of scenes) {
    moodCount[s.mood] = (moodCount[s.mood] || 0) + 1;
  }

  return {
    scenes,
    mood_distribution: moodCount,
    aspect_ratios,
    total_creatives: scenes.length * aspect_ratios.length,
  };
}

// Distribute `n` selections across angle groups as evenly as possible,
// preserving the original scene order within each angle.
function pickEvenlyAcrossAngles<T extends { angle: string }>(scenes: T[], n: number): T[] {
  const byAngle: Record<string, T[]> = {};
  const order: string[] = [];
  for (const s of scenes) {
    if (!byAngle[s.angle]) { byAngle[s.angle] = []; order.push(s.angle); }
    byAngle[s.angle].push(s);
  }
  const out: T[] = [];
  let i = 0;
  while (out.length < n) {
    const angle = order[i % order.length];
    const pool = byAngle[angle];
    const taken = out.filter((s) => s.angle === angle).length;
    if (taken < pool.length) out.push(pool[taken]);
    i++;
    if (i > 1000) break; // safety
  }
  return out;
}


// ─── 3. Generate per-angle captions + hashtags (Step 4) ────────────────
export interface CaptionGenerationInput {
  product_name: string;
  brand_name: string;
  brand_type: string;
  brand_voice?: string | null;
  target_markets: string[];      // e.g. ['ES', 'NO']
  offer?: string | null;
  angles: string[];
}

export interface AngleCaptionPack {
  primary: string;               // in target_markets[0] language
  secondary?: string;            // in target_markets[1] language
  hashtags: string[];            // 6-10 hashtags
}

export async function generateCaptions(
  input: CaptionGenerationInput
): Promise<Record<string, AngleCaptionPack>> {
  const tmpl = getBrandTemplate(input.brand_type);
  const langPrimary = input.target_markets[0] || "EN";
  const langSecondary = input.target_markets[1];

  const systemPrompt = `You are a senior copywriter writing native Instagram captions for paid ads. Each caption is short (12-25 words), sensory, on-brand, and ends with a clear CTA referencing the offer. Write natively in each language — never translate word-for-word. Always respond with valid JSON.`;

  const prompt = `Write captions for an IG ad campaign.

Product: ${input.product_name}
Brand: ${input.brand_name} (${input.brand_type})
Brand voice: ${input.brand_voice || "(infer from brand type)"}
Style hint: ${tmpl.caption_style_hint}
Offer/CTA: ${input.offer || "shop now"}
Primary language: ${langPrimary}${langSecondary ? `\nSecondary language: ${langSecondary}` : ""}

For each of these ${input.angles.length} angles, write a caption pack:
${input.angles.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Return strict JSON keyed by angle name:
{
  "<angle name>": {
    "primary": "<caption in ${langPrimary}, 12-25 words>",
    ${langSecondary ? `"secondary": "<caption in ${langSecondary}>",` : ""}
    "hashtags": ["#tag1", "#tag2", ... 6-10 hashtags mixing broad + niche + branded]
  },
  ...
}`;

  const text = await askClaude(prompt, {
    systemPrompt,
    maxTokens: 2000,
    temperature: 0.6,
  });
  return parseJsonResponse<Record<string, AngleCaptionPack>>(text);
}


// ─── 4. Pick top 5 ads to A/B test first (Step 4) ──────────────────────
export interface TopPickInput {
  campaign: AdCampaign;
  creatives: AdCreative[];        // only completed ones
}

export interface TopPick {
  creative_id: string;
  rank: number;
  rationale: string;
}

export async function pickTopFive(input: TopPickInput): Promise<TopPick[]> {
  const tmpl = getBrandTemplate(input.campaign.brand_voice || "ecommerce");

  // Build a compact summary table for Claude — don't send all images, just
  // metadata (model can't see them anyway via this path).
  const rows = input.creatives.map((c) => ({
    id: c.id,
    scene: c.scene_id,
    angle: c.angle,
    mood: c.mood,
    aspect: c.aspect_ratio,
  }));

  const systemPrompt = `You are a senior performance-marketing strategist selecting the strongest 5 ads to A/B test first from a 50-ad set. Always respond with valid JSON. Choose for maximum coverage: spread across angles, mix moods, include both aspect ratios, address both B2B and B2C if both are in the audience.`;

  const prompt = `Pick the top 5 from this list of completed ad creatives for the first A/B test.

Campaign: ${input.campaign.name}
Product: ${input.campaign.product_name}
Audiences: ${input.campaign.audience_segments.join("; ")}
Funnel: ${input.campaign.funnel_stage}
Brand caption hint: ${tmpl.caption_style_hint}

Creatives (id, scene, angle, mood, aspect):
${rows.map((r) => `- ${r.id} | ${r.scene} | ${r.angle} | ${r.mood} | ${r.aspect}`).join("\n")}

Selection criteria:
1. Strongest hook potential (visual stop power)
2. Clearest single-message communication
3. Coverage across angles (don't pick 5 from the same angle)
4. Mix of 1:1 and 9:16
5. Cover both audience segments if multiple

Return strict JSON:
{
  "picks": [
    {"creative_id": "<uuid>", "rank": 1, "rationale": "<short reason>"},
    ... 5 entries
  ]
}`;

  const text = await askClaude(prompt, {
    systemPrompt,
    maxTokens: 800,
    temperature: 0.3,
  });
  const result = parseJsonResponse<{ picks: TopPick[] }>(text);
  return result.picks.slice(0, 5);
}
