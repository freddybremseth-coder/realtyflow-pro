import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { BRANDS } from "@/lib/constants";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

const brandProfileSchema = z.object({
  brandId: z.string().min(2).max(80),
  visualStyle: z.string().max(1000).optional(),
  preferredEnvironments: z.array(z.string()).max(20).default([]),
  preferredLighting: z.string().max(300).optional(),
  forbiddenTerms: z.array(z.string()).max(30).default([]),
  forbiddenVisuals: z.array(z.string()).max(30).default([]),
  textRules: z.string().max(1000).optional(),
  logoRules: z.string().max(1000).optional(),
  legalNotes: z.string().max(1000).optional(),
  defaultFormats: z.array(z.string()).max(12).default([]),
  defaultProvider: z.enum(["gemini", "openart"]).optional(),
  defaultQualityTier: z.enum(["fast", "balanced", "premium"]).default("balanced"),
});

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { brands: [] });
    if ("error" in context) return context.error;

    const { data } = await context.supabase
      .from("media_brand_profiles")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${context.scope.organizationId}`);

    const profiles = new Map((data || []).map((profile) => [String(profile.brand_id), profile]));
    const brands = BRANDS.map((brand) => ({
      ...brand,
      mediaProfile: profiles.get(brand.id) || null,
    }));

    return NextResponse.json({ brands });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const body = brandProfileSchema.parse(await request.json());
    const brand = BRANDS.find((item) => item.id === body.brandId);
    if (!brand) return NextResponse.json({ error: "Ukjent brand" }, { status: 400 });

    const { data, error } = await context.supabase
      .from("media_brand_profiles")
      .upsert({
        organization_id: context.scope.organizationId,
        brand_id: brand.id,
        name: brand.name,
        colors: [brand.color],
        audience: brand.target_audience,
        tone: brand.tone,
        visual_style: body.visualStyle || brand.description,
        preferred_environments: body.preferredEnvironments,
        preferred_lighting: body.preferredLighting || null,
        products: brand.specialties || [],
        keywords: brand.specialties || [],
        forbidden_terms: body.forbiddenTerms,
        forbidden_visuals: body.forbiddenVisuals,
        text_rules: body.textRules || null,
        logo_rules: body.logoRules || null,
        legal_notes: body.legalNotes || null,
        default_formats: body.defaultFormats,
        default_provider: body.defaultProvider || null,
        default_quality_tier: body.defaultQualityTier,
      }, { onConflict: "organization_id,brand_id" })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return NextResponse.json({ profile: data });
  } catch (error) {
    return jsonError(error, 400);
  }
}
