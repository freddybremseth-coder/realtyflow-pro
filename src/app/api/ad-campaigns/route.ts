// ─── GET /api/ad-campaigns  →  list campaigns ───────────────────────────
// ─── POST /api/ad-campaigns  →  create new campaign (intake) ────────────
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

const providerSchema = z.enum(["auto", "openart", "gemini", "flux", "replicate"]);
const styleSchema = z.enum([
  "product_focused",
  "lifestyle",
  "luxury",
  "scandinavian_clean",
  "organic_natural",
  "seasonal",
  "social_proof",
  "promo_sale",
  "mixed",
]);
const overlaySchema = z.enum(["none", "suggestions", "automatic"]);
const ratioSchema = z.enum(["1:1", "4:5", "9:16", "16:9", "1.91:1"]);

const createCampaignSchema = z.object({
  brand_id: z.string().max(80).nullable().optional(),
  name: z.string().trim().min(2).max(180),
  product_name: z.string().trim().min(2).max(300),
  product_image_url: z.string().url(),
  label_description: z.string().trim().min(3).max(4_000),
  target_markets: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  audience_segments: z.array(z.string().trim().min(1).max(180)).max(30).default([]),
  brand_voice: z.string().max(1_000).nullable().optional(),
  funnel_stage: z.string().max(80).default("cold"),
  offer: z.string().max(500).nullable().optional(),
  off_limits: z.string().max(2_000).nullable().optional(),
  total_creatives: z.number().int().min(5).max(50).default(50),
  aspect_ratios: z.array(ratioSchema).min(1).max(5).default(["1:1", "4:5", "9:16"]),
  image_provider: providerSchema.default("auto"),
  campaign_style: styleSchema.default("mixed"),
  overlay_mode: overlaySchema.default("suggestions"),
  preserve_product_identity: z.boolean().default(true),
  concept_count: z.number().int().min(1).max(10).default(10),
  variants_per_concept: z.number().int().min(1).max(10).default(5),
});

function estimatedUnitCost(provider: z.infer<typeof providerSchema>) {
  if (provider === "gemini") return 0.02;
  if (provider === "openart") return 0.03;
  if (provider === "flux" || provider === "replicate") return 0.04;
  return 0.03;
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const url = new URL(req.url);
  const brandId = url.searchParams.get("brand_id");

  let query = supabase.from("ad_campaigns").select("*").order("created_at", { ascending: false });
  if (brandId) query = query.eq("brand_id", brandId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const parsed = createCampaignSchema.parse(await req.json());
    const provider = parsed.image_provider === "replicate" ? "flux" : parsed.image_provider;
    const total = parsed.total_creatives;
    const conceptCount = Math.min(parsed.concept_count, total, 10);
    const variantsPerConcept = Math.max(
      parsed.variants_per_concept,
      Math.ceil(total / conceptCount),
    );

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("ad_campaigns")
      .insert({
        brand_id: parsed.brand_id || null,
        name: parsed.name,
        product_name: parsed.product_name,
        product_image_url: parsed.product_image_url,
        label_description: parsed.label_description,
        target_markets: parsed.target_markets,
        audience_segments: parsed.audience_segments,
        brand_voice: parsed.brand_voice || null,
        funnel_stage: parsed.funnel_stage,
        offer: parsed.offer || null,
        off_limits: parsed.off_limits || null,
        status: "draft",
        total_creatives: total,
        estimated_cost_usd: Number((total * estimatedUnitCost(provider)).toFixed(2)),
        aspect_ratios: parsed.aspect_ratios,
        image_provider: provider,
        campaign_style: parsed.campaign_style,
        overlay_mode: parsed.overlay_mode,
        preserve_product_identity: parsed.preserve_product_identity,
        concept_count: conceptCount,
        variants_per_concept: Math.min(variantsPerConcept, 20),
        provider_strategy: {
          mode: provider,
          requestedTotal: total,
          createdAt: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaign: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Ugyldig kampanjeoppsett.",
        details: error.flatten(),
      }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
