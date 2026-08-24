/**
 * Phase 7.1 — Creative Generator-adapter. Bruker RealtyFlows eksisterende
 * provider-infra (askClaude) bak DI. Returnerer typed GeneratedAsset + provenance.
 * Alt er DRAFT. Persistering av asset + provenance skjer i marketing_assets.
 */

import { z } from "zod";
import {
  assembleAsset,
  buildCreativePrompt,
  contentPublishabilityGate,
  type CreativeGenerator,
  type CreativeRequest,
  type CreativeResult,
} from "@/lib/marketing/autonomous";
import type { MarketingSupabaseLike } from "@/services/marketing/adapters";

/** DI-søm for tekstgenerering — standard: RealtyFlows askClaude. */
export type GenerateText = (prompt: string, opts?: { systemPrompt?: string; temperature?: number; maxTokens?: number; responseMimeType?: "application/json"; model?: "haiku" | "sonnet" }) => Promise<string>;

/** Strengt output-schema. Modellen MÅ returnere gyldig JSON med publishable=true. */
const CreativeOutputSchema = z.object({
  headline: z.string().optional(),
  body: z.string().min(1),
  cta: z.string().optional(),
  publishable: z.boolean(),
});

/**
 * Streng parsing — INGEN raw-text fallback. Et ikke-JSON / ufullstendig svar blir
 * ALDRI et publiserbart asset (det var slik intern agent-tekst havnet på Instagram).
 */
function strictParse(text: string): { headline?: string; body: string; cta?: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("CREATIVE_OUTPUT_INVALID: modellen returnerte ikke JSON.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("CREATIVE_OUTPUT_INVALID: ugyldig JSON fra modellen.");
  }
  const r = CreativeOutputSchema.safeParse(parsed);
  if (!r.success) throw new Error(`CREATIVE_OUTPUT_INVALID: schema-brudd (${r.error.issues.map((i) => i.path.join(".")).join(", ")}).`);
  if (r.data.publishable !== true) throw new Error("CREATIVE_OUTPUT_INVALID: publishable !== true.");
  // Siste forsvar: intern/meta-tekst er aldri publiserbart.
  const gate = contentPublishabilityGate([r.data.headline, r.data.body, r.data.cta].filter(Boolean).join("\n"));
  if (!gate.publishable) throw new Error(`CREATIVE_OUTPUT_INVALID: ${gate.result} (${gate.reason})`);
  return { headline: r.data.headline, body: r.data.body, cta: r.data.cta };
}

export function makeCreativeGenerator(generateText: GenerateText, opts: { model?: "haiku" | "sonnet"; costPerCallEur?: number } = {}): CreativeGenerator {
  return {
    async generate(req: CreativeRequest): Promise<CreativeResult> {
      const { system, user } = buildCreativePrompt(req);
      const raw = await generateText(user, { systemPrompt: system, responseMimeType: "application/json", temperature: 0.7, model: opts.model ?? "sonnet" });
      const output = strictParse(raw); // kaster CREATIVE_OUTPUT_INVALID ved feil — aldri raw fallback
      return assembleAsset(req, output, { model: opts.model ?? "sonnet", costEur: opts.costPerCallEur ?? 0 });
    },
  };
}

/**
 * Dry-run-generator (default når ANTHROPIC_API_KEY mangler). Bygger et asset fra
 * briefen uten LLM — merket som dry-run i provenance. Ikke mock i live-path;
 * brukes kun når live-credentials mangler.
 */
export function makeDryRunCreativeGenerator(): CreativeGenerator {
  return {
    async generate(req: CreativeRequest): Promise<CreativeResult> {
      // Publiserbar dry-run-caption (ingen placeholder-/meta-markører) — merket
      // dry-run via provenance.model, ikke i selve teksten.
      const area = req.brief.genome.area ?? req.brand.locations[0] ?? "";
      const output = {
        headline: req.brand.brandName,
        body: `${req.brand.valueProposition || "Din nye bolig venter"}${area ? ` i ${area}` : ""}. ${req.brief.angle.replace(/\s*—.*$/, "")}.`.trim(),
        cta: req.brand.preferredCta || "Book visning",
      };
      return assembleAsset(req, output, { model: "dry-run", costEur: 0 });
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
      media: asset.media ?? null,
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
