/**
 * Phase 7.1 — Creative Generator-adapter. Bruker RealtyFlows eksisterende
 * provider-infra (askClaude) bak DI. Returnerer typed GeneratedAsset + provenance.
 * Alt er DRAFT. Persistering av asset + provenance skjer i marketing_assets.
 */

import {
  assembleAsset,
  buildCreativePrompt,
  type CreativeGenerator,
  type CreativeRequest,
  type CreativeResult,
} from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/** DI-søm for tekstgenerering — standard: RealtyFlows askClaude. */
export type GenerateText = (prompt: string, opts?: { systemPrompt?: string; temperature?: number; maxTokens?: number; responseMimeType?: "application/json"; model?: "haiku" | "sonnet" }) => Promise<string>;

function safeParseJson(text: string): { headline?: string; body?: string; cta?: string } {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { body: text.trim() };
  } catch {
    return { body: text.trim() };
  }
}

export function makeCreativeGenerator(generateText: GenerateText, opts: { model?: "haiku" | "sonnet"; costPerCallEur?: number } = {}): CreativeGenerator {
  return {
    async generate(req: CreativeRequest): Promise<CreativeResult> {
      const { system, user } = buildCreativePrompt(req);
      const raw = await generateText(user, { systemPrompt: system, responseMimeType: "application/json", temperature: 0.7, model: opts.model ?? "sonnet" });
      const output = safeParseJson(raw);
      return assembleAsset(req, output, { model: opts.model ?? "sonnet", costEur: opts.costPerCallEur ?? 0 });
    },
  };
}

/** Persistér asset + full provenance (forklarbarhet: hvor kom påstanden fra). */
export async function persistAsset(supabase: MarketingSupabaseLike, result: CreativeResult): Promise<void> {
  const { asset, provenance } = result;
  const { error } = await supabase.from("marketing_assets").upsert(
    {
      content_id: asset.contentId,
      creative_variant_id: asset.creativeVariantId,
      campaign_id: asset.campaignId,
      channel: asset.channel,
      genome: asset.genome,
      headline: asset.headline ?? null,
      body: asset.body ?? null,
      cta: asset.cta ?? null,
      fact_sources: asset.factSources,
      generated_by: provenance.generatedBy,
      model: provenance.model ?? null,
      prompt_version: provenance.promptVersion,
      learning_rules_used: provenance.learningRulesUsed,
      property_ids: provenance.propertyIds,
      provenance,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "creative_variant_id" },
  );
  if (error) throw new Error(`persistAsset failed: ${error.message}`);
}
