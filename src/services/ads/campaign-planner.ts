import type { AspectRatio, Mood } from "@/types/ads";

export type AdImageProvider = "auto" | "openart" | "gemini" | "flux";
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

export interface CampaignConceptDefinition {
  id: string;
  angle: string;
  mood: Mood;
  description: string;
  scenePrompt: string;
  providerPreference: Exclude<AdImageProvider, "auto">;
  headlinePattern: string;
  subheadlinePattern: string;
}

export interface PlannedCreative {
  sceneId: string;
  conceptGroup: string;
  angle: string;
  mood: Mood;
  sceneDescription: string;
  aspectRatio: AspectRatio;
  variantIndex: number;
  provider: Exclude<AdImageProvider, "auto">;
  model: string;
  prompt: string;
  overlayHeadline: string | null;
  overlaySubheadline: string | null;
  overlayCta: string | null;
  overlayBadge: string | null;
}

export interface PlanCampaignInput {
  productName: string;
  productImageUrl: string;
  labelDescription: string;
  audienceSegments: string[];
  targetMarkets: string[];
  brandVoice?: string | null;
  offer?: string | null;
  providerMode: AdImageProvider;
  campaignStyle: AdCampaignStyle;
  overlayMode: AdOverlayMode;
  preserveProductIdentity: boolean;
  totalCreatives: number;
  aspectRatios: AspectRatio[];
  conceptCount?: number;
  variantsPerConcept?: number;
}

const MODEL_BY_PROVIDER = {
  flux: "black-forest-labs/flux-kontext-pro",
  gemini: "gemini-2.5-flash-image",
  openart: "openart-dynamic-image",
} as const;

const COST_USD_BY_PROVIDER = {
  flux: 0.04,
  gemini: 0.02,
  openart: 0.03,
} as const;

const BASE_CONCEPTS: CampaignConceptDefinition[] = [
  {
    id: "premium_hero",
    angle: "Premium Hero",
    mood: "moody/premium",
    description: "Et tydelig hovedmotiv med produktet som kampanjens eksklusive helt.",
    scenePrompt: "Place {PRODUCT} as a commanding premium hero product in an uncluttered commercial scene with elegant directional light, realistic reflections, soft controlled shadows and generous negative space.",
    providerPreference: "flux",
    headlinePattern: "Opplev {PRODUCT_SHORT}",
    subheadlinePattern: "Et premiumvalg for {AUDIENCE}.",
  },
  {
    id: "lifestyle_context",
    angle: "Lifestyle",
    mood: "bright/airy",
    description: "Produktet i en realistisk situasjon målgruppen kjenner seg igjen i.",
    scenePrompt: "Show {PRODUCT} naturally integrated into an aspirational but believable lifestyle setting relevant to {AUDIENCE}, with authentic human-scale details and refined commercial styling.",
    providerPreference: "openart",
    headlinePattern: "En del av øyeblikket",
    subheadlinePattern: "Skapt for mennesker som verdsetter kvalitet.",
  },
  {
    id: "scandinavian_clean",
    angle: "Scandinavian Clean",
    mood: "minimal/clean",
    description: "Ren nordisk komposisjon som passer skandinaviske kjøpere.",
    scenePrompt: "Create a Scandinavian-clean advertising composition for {PRODUCT}: restrained palette, natural materials, soft daylight, precise spacing, calm confidence and strong product separation.",
    providerPreference: "openart",
    headlinePattern: "Ren kvalitet. Tydelig valg.",
    subheadlinePattern: "Designet for en moderne, bevisst livsstil.",
  },
  {
    id: "organic_natural",
    angle: "Organic & Natural",
    mood: "rustic/artisanal",
    description: "Naturlig opprinnelse, råvarer og håndverk uten udokumenterte påstander.",
    scenePrompt: "Present {PRODUCT} with authentic natural textures, origin-inspired materials and subtle artisanal cues. Keep the scene premium and factual; do not invent certifications, ingredients or origin claims.",
    providerPreference: "openart",
    headlinePattern: "Nærmere det ekte",
    subheadlinePattern: "Et produkt med tydelig identitet og naturlig karakter.",
  },
  {
    id: "detail_craft",
    angle: "Craft & Detail",
    mood: "editorial",
    description: "Nærbilde av emballasje, materiale, etikett og kvalitetssignaler.",
    scenePrompt: "Create an editorial macro-detail campaign image focused on the real packaging, material, label hierarchy and craftsmanship of {PRODUCT}. Preserve all recognizable product details.",
    providerPreference: "flux",
    headlinePattern: "Detaljene gjør forskjellen",
    subheadlinePattern: "Se kvaliteten på nært hold.",
  },
  {
    id: "health_wellness",
    angle: "Wellness Lifestyle",
    mood: "bright/airy",
    description: "Velvære og gode valg uten medisinske eller udokumenterte helsepåstander.",
    scenePrompt: "Create a fresh wellness-lifestyle advertising image featuring {PRODUCT}. Communicate balance, quality and everyday wellbeing without medical claims, guaranteed outcomes or invented nutrition facts.",
    providerPreference: "gemini",
    headlinePattern: "Et bedre hverdagsvalg",
    subheadlinePattern: "Kvalitet som passer inn i livet du ønsker å leve.",
  },
  {
    id: "seasonal_moment",
    angle: "Seasonal Moment",
    mood: "vibrant/playful",
    description: "En sesongtilpasset variant som kan brukes i aktuelle kampanjeperioder.",
    scenePrompt: "Build a tasteful seasonal advertising scene around {PRODUCT}, using timely atmosphere and color cues while keeping the product timeless, recognizable and suitable for paid social.",
    providerPreference: "gemini",
    headlinePattern: "Sesongens utvalgte",
    subheadlinePattern: "Gjør øyeblikket litt mer spesielt.",
  },
  {
    id: "gift_luxury",
    angle: "Gift & Luxury",
    mood: "moody/premium",
    description: "Eksklusiv gave- og premiumposisjonering.",
    scenePrompt: "Style {PRODUCT} as a sophisticated gift or luxury purchase, with refined presentation, premium materials and elegant lighting. Do not add invented gift packaging or fake brand text.",
    providerPreference: "flux",
    headlinePattern: "En gave med karakter",
    subheadlinePattern: "Når kvalitet skal få stå i sentrum.",
  },
  {
    id: "social_proof",
    angle: "Trusted Choice",
    mood: "editorial",
    description: "Troverdig og etablert uttrykk uten oppdiktede anmeldelser eller priser.",
    scenePrompt: "Create a trustworthy, established-brand advertising visual for {PRODUCT}. Use confident composition and authentic context, but do not invent testimonials, awards, ratings, customer counts or media logos.",
    providerPreference: "openart",
    headlinePattern: "Et valg du kan være trygg på",
    subheadlinePattern: "Tydelig kvalitet. Profesjonelt presentert.",
  },
  {
    id: "promo_offer",
    angle: "Offer & Action",
    mood: "bold/contrasty",
    description: "Konverteringsrettet bilde med plass til separat tilbudstekst og CTA.",
    scenePrompt: "Create a high-conversion paid-social visual for {PRODUCT} with clear hierarchy, bold but premium contrast and deliberate empty space for a separate offer and CTA overlay. Do not render text inside the image.",
    providerPreference: "gemini",
    headlinePattern: "{OFFER}",
    subheadlinePattern: "Oppdag {PRODUCT_SHORT} i dag.",
  },
];

const STYLE_PRIORITY: Record<AdCampaignStyle, string[]> = {
  product_focused: ["premium_hero", "detail_craft", "scandinavian_clean", "organic_natural"],
  lifestyle: ["lifestyle_context", "health_wellness", "seasonal_moment", "scandinavian_clean"],
  luxury: ["premium_hero", "gift_luxury", "detail_craft", "social_proof"],
  scandinavian_clean: ["scandinavian_clean", "premium_hero", "lifestyle_context", "detail_craft"],
  organic_natural: ["organic_natural", "lifestyle_context", "health_wellness", "detail_craft"],
  seasonal: ["seasonal_moment", "lifestyle_context", "promo_offer", "gift_luxury"],
  social_proof: ["social_proof", "premium_hero", "lifestyle_context", "detail_craft"],
  promo_sale: ["promo_offer", "premium_hero", "lifestyle_context", "seasonal_moment"],
  mixed: [],
};

function cleanText(value: string | null | undefined, fallback: string) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || fallback;
}

function shortProductName(value: string) {
  const cleaned = cleanText(value, "produktet");
  return cleaned.length > 44 ? `${cleaned.slice(0, 41).trim()}…` : cleaned;
}

function orderedConcepts(style: AdCampaignStyle, count: number) {
  const priorities = STYLE_PRIORITY[style] || [];
  const prioritySet = new Set(priorities);
  const ordered = [
    ...priorities.map((id) => BASE_CONCEPTS.find((concept) => concept.id === id)).filter(Boolean),
    ...BASE_CONCEPTS.filter((concept) => !prioritySet.has(concept.id)),
  ] as CampaignConceptDefinition[];
  return ordered.slice(0, Math.max(1, Math.min(count, BASE_CONCEPTS.length)));
}

function resolveProvider(
  mode: AdImageProvider,
  concept: CampaignConceptDefinition,
  variantIndex: number,
): Exclude<AdImageProvider, "auto"> {
  if (mode !== "auto") return mode;

  // Auto intentionally mixes providers by role:
  // Gemini explores the first concept variant cheaply, Flux creates premium
  // hero/fidelity variants, and OpenArt supplies the polished variation set.
  if (variantIndex === 1 && !["premium_hero", "gift_luxury", "detail_craft"].includes(concept.id)) {
    return "gemini";
  }
  if (["premium_hero", "gift_luxury", "detail_craft"].includes(concept.id) && variantIndex <= 2) {
    return "flux";
  }
  return concept.providerPreference === "gemini" && variantIndex > 1
    ? "openart"
    : concept.providerPreference;
}

function replaceTokens(value: string, input: PlanCampaignInput) {
  const audience = cleanText(input.audienceSegments.join(", "), "kvalitetsbevisste kunder");
  const offer = cleanText(input.offer, "Oppdag produktet");
  return value
    .replace(/\{PRODUCT_SHORT\}/g, shortProductName(input.productName))
    .replace(/\{PRODUCT\}/g, input.productName)
    .replace(/\{AUDIENCE\}/g, audience)
    .replace(/\{OFFER\}/g, offer);
}

function providerPrompt(
  provider: Exclude<AdImageProvider, "auto">,
  concept: CampaignConceptDefinition,
  input: PlanCampaignInput,
  variantIndex: number,
) {
  const audience = cleanText(input.audienceSegments.join(", "), "premium social-media buyers");
  const markets = cleanText(input.targetMarkets.join(", "), "international markets");
  const voice = cleanText(input.brandVoice, "professional, credible and modern");
  const productRule = input.preserveProductIdentity
    ? `Preserve the exact real product identity from the uploaded reference: package shape, proportions, logo placement, label hierarchy, colors and recognizable details. Label reference: ${input.labelDescription}. Do not replace, redesign or invent branding.`
    : "Use the uploaded product as the recognizable main subject.";
  const noTextRule = input.overlayMode === "none"
    ? "Do not add random text, watermarks or invented labels."
    : "Do not render headline, offer, badge or CTA text inside the image. Leave intentional negative space for a separate RealtyFlow text overlay.";
  const variation = [
    "balanced front-facing composition",
    "slightly elevated editorial composition",
    "closer product crop with controlled depth",
    "wider lifestyle composition with stronger negative space",
    "dynamic paid-social crop with premium contrast",
  ][(variantIndex - 1) % 5];

  const shared = [
    replaceTokens(concept.scenePrompt, input),
    productRule,
    noTextRule,
    `Audience: ${audience}. Markets: ${markets}. Brand voice: ${voice}.`,
    `Variant direction: ${variation}.`,
    "Commercially believable, polished paid-social advertising, realistic light and materials, no duplicated product, no distorted package, no unrelated props, no watermark.",
  ].join("\n\n");

  if (provider === "flux") {
    return `Create a high-fidelity premium campaign image using the uploaded product image as the exact visual reference.\n\n${shared}\n\nFlux Kontext priority: maximum product and label fidelity, refined editorial finish, precise commercial photography.`;
  }
  if (provider === "openart") {
    return `Create a polished Instagram/Meta advertising visual from the uploaded product reference.\n\n${shared}\n\nOpenArt priority: preserve the product while creating a distinctive, art-directed campaign variation with clean social-media composition.`;
  }
  return `Generate one clean, ad-ready campaign concept using the uploaded product as the central subject.\n\n${shared}\n\nGemini priority: strong concept clarity, believable lifestyle context and useful negative space. Keep the product commercially recognizable.`;
}

function overlayCopy(concept: CampaignConceptDefinition, input: PlanCampaignInput) {
  if (input.overlayMode === "none") {
    return { headline: null, subheadline: null, cta: null, badge: null };
  }
  const headline = replaceTokens(concept.headlinePattern, input);
  const subheadline = replaceTokens(concept.subheadlinePattern, input);
  const cta = input.offer ? "Se tilbudet" : "Les mer";
  const badge = concept.id === "promo_offer" && input.offer ? input.offer : null;
  return { headline, subheadline, cta, badge };
}

export function planAdCampaign(input: PlanCampaignInput) {
  const total = Math.max(1, Math.min(200, Math.round(input.totalCreatives)));
  const ratios = input.aspectRatios.length ? input.aspectRatios : (["1:1"] as AspectRatio[]);
  const conceptCount = Math.max(1, Math.min(input.conceptCount || 10, BASE_CONCEPTS.length, total));
  const concepts = orderedConcepts(input.campaignStyle, conceptCount);
  const requestedVariants = Math.max(1, Math.min(input.variantsPerConcept || 5, 20));
  const creatives: PlannedCreative[] = [];

  let creativeIndex = 0;
  for (let conceptIndex = 0; conceptIndex < concepts.length && creatives.length < total; conceptIndex += 1) {
    const concept = concepts[conceptIndex];
    const remaining = total - creatives.length;
    const remainingConcepts = concepts.length - conceptIndex;
    const variantsForConcept = Math.max(1, Math.min(requestedVariants, Math.ceil(remaining / remainingConcepts)));

    for (let variantIndex = 1; variantIndex <= variantsForConcept && creatives.length < total; variantIndex += 1) {
      creativeIndex += 1;
      const provider = resolveProvider(input.providerMode, concept, variantIndex);
      const aspectRatio = ratios[(creativeIndex - 1) % ratios.length];
      const overlay = overlayCopy(concept, input);
      creatives.push({
        sceneId: `C${String(conceptIndex + 1).padStart(2, "0")}-V${String(variantIndex).padStart(2, "0")}`,
        conceptGroup: concept.id,
        angle: concept.angle,
        mood: concept.mood,
        sceneDescription: concept.description,
        aspectRatio,
        variantIndex,
        provider,
        model: MODEL_BY_PROVIDER[provider],
        prompt: providerPrompt(provider, concept, input, variantIndex),
        overlayHeadline: overlay.headline,
        overlaySubheadline: overlay.subheadline,
        overlayCta: overlay.cta,
        overlayBadge: overlay.badge,
      });
    }
  }

  // If the requested total exceeds conceptCount × variantsPerConcept, continue
  // cycling the concepts while incrementing the variant number.
  while (creatives.length < total) {
    const conceptIndex = creatives.length % concepts.length;
    const concept = concepts[conceptIndex];
    const previousCount = creatives.filter((item) => item.conceptGroup === concept.id).length;
    const variantIndex = previousCount + 1;
    creativeIndex += 1;
    const provider = resolveProvider(input.providerMode, concept, variantIndex);
    const overlay = overlayCopy(concept, input);
    creatives.push({
      sceneId: `C${String(conceptIndex + 1).padStart(2, "0")}-V${String(variantIndex).padStart(2, "0")}`,
      conceptGroup: concept.id,
      angle: concept.angle,
      mood: concept.mood,
      sceneDescription: concept.description,
      aspectRatio: ratios[(creativeIndex - 1) % ratios.length],
      variantIndex,
      provider,
      model: MODEL_BY_PROVIDER[provider],
      prompt: providerPrompt(provider, concept, input, variantIndex),
      overlayHeadline: overlay.headline,
      overlaySubheadline: overlay.subheadline,
      overlayCta: overlay.cta,
      overlayBadge: overlay.badge,
    });
  }

  const providerCounts = creatives.reduce<Record<string, number>>((counts, item) => {
    counts[item.provider] = (counts[item.provider] || 0) + 1;
    return counts;
  }, {});
  const estimatedCostUsd = creatives.reduce((sum, item) => sum + COST_USD_BY_PROVIDER[item.provider], 0);
  const moodDistribution = creatives.reduce<Record<string, number>>((counts, item) => {
    counts[item.mood] = (counts[item.mood] || 0) + 1;
    return counts;
  }, {});

  return {
    concepts,
    creatives,
    matrix: {
      scenes: concepts.map((concept, index) => ({
        id: `C${String(index + 1).padStart(2, "0")}`,
        angle: concept.angle,
        mood: concept.mood,
        prompt_body: concept.scenePrompt,
      })),
      mood_distribution: moodDistribution,
      aspect_ratios: ratios,
      total_creatives: creatives.length,
      concept_groups: concepts.map((concept) => ({
        id: concept.id,
        angle: concept.angle,
        description: concept.description,
      })),
    },
    providerStrategy: {
      mode: input.providerMode,
      counts: providerCounts,
      models: MODEL_BY_PROVIDER,
      estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
      assumptions: COST_USD_BY_PROVIDER,
    },
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(2)),
  };
}

export function providerCost(provider: Exclude<AdImageProvider, "auto">) {
  return COST_USD_BY_PROVIDER[provider];
}
