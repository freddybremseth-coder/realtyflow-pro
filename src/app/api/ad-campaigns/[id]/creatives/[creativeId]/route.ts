import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const overlayPatchSchema = z.object({
  overlay_headline: z.string().max(160).nullable().optional(),
  overlay_subheadline: z.string().max(300).nullable().optional(),
  overlay_cta: z.string().max(80).nullable().optional(),
  overlay_badge: z.string().max(100).nullable().optional(),
  overlay_applied: z.boolean().optional(),
});

const actionSchema = z.object({
  action: z.enum(["regenerate", "create_variant"]),
  provider: z.enum(["openart", "gemini", "flux"]).optional(),
});

async function loadCreative(
  campaignId: string,
  creativeId: string,
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("ad_creatives")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("id", creativeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { supabase, creative: null };
  return { supabase, creative: data };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; creativeId: string } },
) {
  try {
    const body = overlayPatchSchema.parse(await request.json());
    const { supabase, creative } = await loadCreative(params.id, params.creativeId);
    if (!creative) return NextResponse.json({ error: "Fant ikke annonsen." }, { status: 404 });

    const update = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    );
    const { data, error } = await supabase
      .from("ad_creatives")
      .update(update)
      .eq("campaign_id", params.id)
      .eq("id", params.creativeId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ creative: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ugyldige overlay-felt.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; creativeId: string } },
) {
  try {
    const body = actionSchema.parse(await request.json());
    const { supabase, creative } = await loadCreative(params.id, params.creativeId);
    if (!creative) return NextResponse.json({ error: "Fant ikke annonsen." }, { status: 404 });

    if (body.action === "regenerate") {
      const provider = body.provider || creative.provider || "openart";
      const { data, error } = await supabase
        .from("ad_creatives")
        .update({
          status: "pending",
          provider,
          model: provider === "flux"
            ? "black-forest-labs/flux-kontext-pro"
            : provider === "gemini"
              ? "gemini-2.5-flash-image"
              : "openart-dynamic-image",
          provider_job_id: null,
          replicate_prediction_id: null,
          image_url: null,
          thumbnail_url: null,
          source_url: null,
          output_asset_id: null,
          error: null,
          metadata_json: {
            ...(creative.metadata_json || {}),
            regeneratedAt: new Date().toISOString(),
          },
        })
        .eq("id", creative.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      await supabase
        .from("ad_campaigns")
        .update({ status: "matrix_pending", error: null })
        .eq("id", params.id);
      return NextResponse.json({ creative: data, action: "regenerate" });
    }

    const { data: siblings, error: siblingError } = await supabase
      .from("ad_creatives")
      .select("variant_index")
      .eq("campaign_id", params.id)
      .eq("concept_group", creative.concept_group || creative.angle)
      .order("variant_index", { ascending: false })
      .limit(1);
    if (siblingError) throw new Error(siblingError.message);
    const nextVariant = Number(siblings?.[0]?.variant_index || creative.variant_index || 1) + 1;
    const provider = body.provider || creative.provider || "openart";

    const { data: variant, error: variantError } = await supabase
      .from("ad_creatives")
      .insert({
        campaign_id: params.id,
        scene_id: `${String(creative.scene_id).replace(/-V\d+$/i, "")}-V${String(nextVariant).padStart(2, "0")}`,
        concept_group: creative.concept_group || creative.angle,
        variant_index: nextVariant,
        angle: creative.angle,
        mood: creative.mood,
        scene_description: creative.scene_description,
        aspect_ratio: creative.aspect_ratio,
        prompt: `${creative.prompt}\n\nCreate a clearly distinct additional campaign variation while preserving the same product identity, concept family and negative-space requirements. Variation number ${nextVariant}.`,
        provider,
        model: provider === "flux"
          ? "black-forest-labs/flux-kontext-pro"
          : provider === "gemini"
            ? "gemini-2.5-flash-image"
            : "openart-dynamic-image",
        overlay_headline: creative.overlay_headline,
        overlay_subheadline: creative.overlay_subheadline,
        overlay_cta: creative.overlay_cta,
        overlay_badge: creative.overlay_badge,
        overlay_applied: creative.overlay_applied || false,
        status: "pending",
        metadata_json: {
          ...(creative.metadata_json || {}),
          variantOf: creative.id,
          createdAt: new Date().toISOString(),
        },
      })
      .select("*")
      .single();
    if (variantError) throw new Error(variantError.message);

    const { count } = await supabase
      .from("ad_creatives")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", params.id);
    await supabase
      .from("ad_campaigns")
      .update({
        status: "matrix_pending",
        total_creatives: count || 0,
        error: null,
      })
      .eq("id", params.id);

    return NextResponse.json({ creative: variant, action: "create_variant" }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Ugyldig creative-handling.", details: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
