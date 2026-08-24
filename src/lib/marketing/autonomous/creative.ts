/**
 * Phase 7.1 — Creative Generator (kontrakt + brand-aware prompt + provenance).
 * Selve LLM-kallet er en DI-søm (bruk RealtyFlows eksisterende provider-infra).
 * Alt som genereres er DRAFT. Provenance lagres alltid — systemet skal kunne
 * forklare hvor en påstand kom fra.
 */

import type { ContentGenome, MarketingChannel } from "../genome";
import type { GenomeRecommendation } from "../learning";
import { CHANNEL_SPECS } from "./channel";
import type { ContentBrief, GeneratedAsset } from "./schemas";
import type { BrandContext } from "./brand-brain";

export const CREATIVE_PROMPT_VERSION = "cg-1.0";

export interface CreativeRequest {
  brief: ContentBrief;
  brand: BrandContext;
  recommendation?: GenomeRecommendation;
  learningNotes?: string[];
  /** Verifiserbare fakta modellen får bruke (med kilde) — hindrer oppdiktede tall. */
  facts?: Array<{ claim: string; source: string }>;
  propertyIds?: string[];
}

export interface AssetProvenance {
  generatedBy: string;
  model?: string;
  promptVersion: string;
  learningRulesUsed: string[];
  factSources: Array<{ claim: string; source: string }>;
  propertyIds: string[];
  createdAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
}

export interface CreativeResult {
  asset: GeneratedAsset;
  provenance: AssetProvenance;
}

/** DI-søm for ekte generering (RealtyFlows Claude/Gemini-infra). */
export interface CreativeGenerator {
  generate(req: CreativeRequest): Promise<CreativeResult>;
}

const FORMAT_INSTRUCTIONS: Partial<Record<string, string>> = {
  reel: "Reel-manus: hook i første 2 sek, 3–5 korte scener, tekst-overlay, CTA til slutt.",
  short: "Short-manus: rask hook, vertikalt, loop-vennlig, én tydelig idé.",
  video: "YouTube long-form-manus: tittel + thumbnail-idé, retention-struktur, søkeintensjon, CTA.",
  article: "Nettartikkel: SEO-tittel, meta-beskrivelse, seksjoner, interne lenker, avsluttende CTA.",
  carousel: "Karusell: 5–7 slides, én idé per slide, siste slide = CTA.",
  post: "Post: fortellende åpning, verdi, tydelig CTA.",
  landing_page: "Landingsside-copy: hero, verdiforslag, bevis, skjema-CTA.",
  email: "E-post: personlig åpning, én verdi, tydelig neste steg.",
};

/**
 * Bygg brand-aware, channel-native prompt. Ren funksjon (testbar). Legger inn
 * learning-anbefalinger, tillatte/forbudte påstander, verifiserbare fakta og
 * krav om at sensitive tall MÅ ha kilde.
 */
export function buildCreativePrompt(req: CreativeRequest): { system: string; user: string } {
  const { brief, brand } = req;
  const spec = CHANNEL_SPECS[brief.channel as MarketingChannel];
  const favored = req.recommendation ? Object.entries(req.recommendation.favor).map(([d, v]) => `${d}=${v?.value}`).join(", ") : "";
  const avoided = req.recommendation ? req.recommendation.avoid.map((a) => `${a.dimension}=${a.value}`).join(", ") : "";

  const system = [
    `Du er markedsføringsforfatter for ${brand.brandName}.`,
    brand.voice && `Tone: ${brand.voice}.`,
    brand.audience && `Målgruppe: ${brand.audience}.`,
    brand.valueProposition && `Verdiforslag: ${brand.valueProposition}.`,
    brand.languages.length && `Språk: ${brand.languages.join(", ")}.`,
    brand.allowedClaims.length && `Tillatte påstander: ${brand.allowedClaims.join("; ")}.`,
    brand.forbiddenClaims.length && `FORBUDTE påstander (bruk aldri): ${brand.forbiddenClaims.join("; ")}.`,
    `Sensitive tall (pris, skatt, rente, markedsstatistikk) MÅ ha kilde. Uten kilde: ikke oppgi tallet.`,
  ].filter(Boolean).join("\n");

  const user = [
    `Kanal: ${brief.channel} — ${spec?.adaptationNote ?? ""}`,
    FORMAT_INSTRUCTIONS[brief.genome.format] && `Format: ${FORMAT_INSTRUCTIONS[brief.genome.format]}`,
    `Vinkel: ${brief.angle}`,
    `Mål: ${brief.goal.kind}.`,
    brand.preferredCta && `Foretrukket CTA: ${brand.preferredCta}.`,
    favored && `Bruk det som funker (learning): ${favored}.`,
    avoided && `Unngå: ${avoided}.`,
    req.facts?.length && `Verifiserbare fakta du kan bruke:\n${req.facts.map((f) => `- ${f.claim} (kilde: ${f.source})`).join("\n")}`,
    `Skriv KUN den ferdige, kundevendte posten — aldri prosessbeskrivelse («Jeg setter opp…», «Here is your post…», «As an AI…»).`,
    `Returner KUN gyldig JSON: { "headline": string, "body": string, "cta": string, "publishable": boolean }. Sett publishable=true kun hvis "body" er en ekte, ferdig caption klar til å publiseres.`,
  ].filter(Boolean).join("\n");

  return { system, user };
}

/** Sett sammen et GeneratedAsset + provenance fra modell-output. Ren funksjon. */
export function assembleAsset(
  req: CreativeRequest,
  output: { headline?: string; body?: string; cta?: string },
  meta: { model?: string; costEur?: number; now?: string },
): CreativeResult {
  const now = meta.now ?? new Date().toISOString();
  const genome: ContentGenome = req.brief.genome;
  const learningRulesUsed = req.recommendation ? Object.entries(req.recommendation.favor).map(([d, v]) => `${d}=${v?.value}`) : [];
  return {
    asset: {
      contentId: req.brief.contentId,
      creativeVariantId: `${req.brief.contentId}_v1`,
      campaignId: req.brief.campaignId,
      channel: req.brief.channel,
      genome,
      headline: output.headline,
      body: output.body,
      cta: output.cta ?? req.brand.preferredCta,
      factSources: req.facts ?? [],
      generator: { model: meta.model, costEur: meta.costEur ?? 0 },
    },
    provenance: {
      generatedBy: "creative-generator",
      model: meta.model,
      promptVersion: CREATIVE_PROMPT_VERSION,
      learningRulesUsed,
      factSources: req.facts ?? [],
      propertyIds: req.propertyIds ?? [],
      createdAt: now,
      approvedBy: null,
      approvedAt: null,
    },
  };
}
