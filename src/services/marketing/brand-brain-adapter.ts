/**
 * Phase 7.1 — Brand Brain-adapter. Henter/lagrer strukturert brand-context per
 * merke fra brand_context. Marketing Director og Creative Generator henter dette
 * automatisk — ingen brand-hardcoding.
 */

import { parseBrandContext, type BrandContext } from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

export async function loadBrandContext(supabase: MarketingSupabaseLike, brandId: string): Promise<BrandContext | null> {
  const { data } = await supabase.from("brand_context").select("*").eq("brand_id", brandId).maybeSingle();
  if (!data) return null;
  return parseBrandContext({
    brandId: data.brand_id,
    brandName: data.brand_name,
    voice: data.voice ?? "",
    audience: data.audience ?? "",
    languages: data.languages ?? ["no"],
    markets: data.markets ?? [],
    services: data.services ?? [],
    valueProposition: data.value_proposition ?? "",
    allowedClaims: data.allowed_claims ?? [],
    forbiddenClaims: data.forbidden_claims ?? [],
    preferredCta: data.preferred_cta ?? "",
    visualDirection: data.visual_direction ?? "",
    locations: data.locations ?? [],
    urls: data.urls ?? [],
    contact: data.contact ?? {},
  });
}

export async function upsertBrandContext(supabase: MarketingSupabaseLike, brand: BrandContext): Promise<void> {
  const b = parseBrandContext(brand);
  const { error } = await supabase.from("brand_context").upsert(
    {
      brand_id: b.brandId, brand_name: b.brandName, voice: b.voice, audience: b.audience,
      languages: b.languages, markets: b.markets, services: b.services, value_proposition: b.valueProposition,
      allowed_claims: b.allowedClaims, forbidden_claims: b.forbiddenClaims, preferred_cta: b.preferredCta,
      visual_direction: b.visualDirection, locations: b.locations, urls: b.urls, contact: b.contact,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id" },
  );
  if (error) throw new Error(`upsertBrandContext failed: ${error.message}`);
}
