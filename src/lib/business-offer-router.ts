import {
  businessPipelineForBrand,
  type BusinessPipelineId,
} from "@/lib/business-pipeline-registry";

export type OfferRouteConfidence = "high" | "medium" | "low";

export interface BusinessOfferRoutingInput {
  brandId?: string | null;
  explicitPipelineId?: BusinessPipelineId | null;
  intents?: readonly string[] | null;
  ctas?: readonly string[] | null;
  source?: string | null;
  href?: string | null;
  text?: string | null;
}

export interface BusinessOfferRoute {
  pipelineId: BusinessPipelineId;
  confidence: OfferRouteConfidence;
  reason: string;
  matchedSignal: string | null;
  source: "explicit_pipeline" | "intent" | "cta" | "context" | "brand_default";
  needsReview: boolean;
}

const SIGNAL_PIPELINES: ReadonlyArray<{
  pipelineId: BusinessPipelineId;
  signals: readonly string[];
}> = [
  {
    pipelineId: "real_estate_sales",
    signals: [
      "property_lead", "viewing_request", "plot_enquiry", "book_viewing", "view_property",
      "request_plot_options", "property", "bolig", "eiendom", "visning", "plot", "tomt",
      "buyer", "kjøper",
    ],
  },
  {
    pipelineId: "publishing",
    signals: [
      "book_sale", "sample_read", "book_page_visit", "catalog_discovery", "read_sample", "view_book",
      "buy_book", "browse_catalog", "book", "books", "bok", "bøker", "kindle", "amazon",
      "reader", "leser", "sample chapter", "prøvekapittel",
    ],
  },
  {
    pipelineId: "ai_products_services",
    signals: [
      "product_interest", "demo_request", "product_waitlist", "see_product", "see_demo", "join_waitlist",
      "subscription", "request_website", "ai", "nexus", "realtyflow", "chatgenius", "automation",
      "demo", "saas", "app", "software",
    ],
  },
  {
    pipelineId: "expert_advisory",
    signals: [
      "advisory_lead", "consultation", "contact_advisor", "advisory", "rådgivning", "rådgiver",
      "consulting", "consultant", "discovery_call", "expert help", "eksperthjelp",
    ],
  },
  {
    pipelineId: "product_commerce",
    signals: [
      "product_interest", "product_view", "buy_product", "order", "checkout", "olive oil", "olivenolje",
      "olives", "oliven", "dona anna", "doña anna",
    ],
  },
  {
    pipelineId: "creator_media",
    signals: [
      "youtube_view", "subscriber", "social_follow", "watch_on_youtube", "subscribe", "music", "song",
      "video", "youtube", "remasterfreddy", "re-master freddy",
    ],
  },
] as const;

function normalize(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("nb-NO");
}

function signalMatches(haystack: string, signal: string) {
  const normalizedSignal = normalize(signal);
  if (!normalizedSignal) return false;
  if (normalizedSignal.includes("_") || normalizedSignal.includes("-")) {
    return haystack.split(/\s+/).includes(normalizedSignal);
  }
  return haystack.includes(normalizedSignal);
}

function findSignal(values: readonly string[], allowedSources?: readonly ("intent" | "cta" | "context")[]) {
  const candidates = values.map(normalize).filter(Boolean);
  for (const row of SIGNAL_PIPELINES) {
    for (const candidate of candidates) {
      const matched = row.signals.find((signal) => signalMatches(candidate, signal));
      if (matched) return { pipelineId: row.pipelineId, matchedSignal: matched, candidate, allowedSources };
    }
  }
  return null;
}

function routeFromValues(
  values: readonly string[],
  source: "intent" | "cta" | "context",
  confidence: OfferRouteConfidence,
): BusinessOfferRoute | null {
  const match = findSignal(values, [source]);
  if (!match) return null;
  return {
    pipelineId: match.pipelineId,
    confidence,
    reason: `${source === "intent" ? "Eksplisitt intent" : source === "cta" ? "Eksplisitt CTA" : "Dokumentert kontekst"} peker til ${match.pipelineId}.`,
    matchedSignal: match.matchedSignal,
    source,
    needsReview: confidence === "low",
  };
}

export function routeBusinessOffer(input: BusinessOfferRoutingInput): BusinessOfferRoute | null {
  if (input.explicitPipelineId) {
    return {
      pipelineId: input.explicitPipelineId,
      confidence: "high",
      reason: "Pipeline er eksplisitt angitt av kilden.",
      matchedSignal: input.explicitPipelineId,
      source: "explicit_pipeline",
      needsReview: false,
    };
  }

  const intentRoute = routeFromValues(input.intents ?? [], "intent", "high");
  if (intentRoute) return intentRoute;

  const ctaRoute = routeFromValues(input.ctas ?? [], "cta", "high");
  if (ctaRoute) return ctaRoute;

  const context = [input.href, input.source, input.text].map(normalize).filter(Boolean);
  const contextRoute = routeFromValues(context, "context", "medium");
  if (contextRoute) return contextRoute;

  const brandId = normalize(input.brandId);
  if (!brandId) return null;
  const brand = businessPipelineForBrand(brandId);
  if (!brand) return null;

  const isUmbrella = brand.binding.role === "umbrella";
  return {
    pipelineId: brand.pipeline.id,
    confidence: isUmbrella ? "low" : "medium",
    reason: isUmbrella
      ? `Brandet ${brandId} er et umbrella-brand. Ingen tydelig offer-intent ble funnet; standardpipeline brukes bare som foreløpig fallback.`
      : `Ingen sterk offer-intent ble funnet. Bruker brandets primære business-pipeline som fallback.`,
    matchedSignal: brandId,
    source: "brand_default",
    needsReview: isUmbrella,
  };
}
