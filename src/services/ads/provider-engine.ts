import { GeminiMediaProvider } from "@/services/media/providers/gemini-media-provider";
import {
  getOpenArtCreation,
  openArtGenerateImage,
} from "@/services/integrations/openart-client";
import {
  extractOutputUrl,
  pollPrediction,
  submitPrediction,
} from "./replicate-client";
import type { AdImageProvider } from "./campaign-planner";

export type ConcreteAdProvider = Exclude<AdImageProvider, "auto">;

export interface AdProviderInput {
  provider: ConcreteAdProvider;
  prompt: string;
  productImageUrl: string;
  aspectRatio: string;
  model?: string | null;
  qualityTier?: "fast" | "balanced" | "premium";
}

export type AdProviderSubmission =
  | {
      state: "completed";
      provider: ConcreteAdProvider;
      model: string;
      bytes: Buffer;
      mimeType: string;
      sourceUrl?: string;
      textResponse?: string;
    }
  | {
      state: "submitted";
      provider: ConcreteAdProvider;
      model: string;
      providerJobId: string;
    };

export type AdProviderPollResult =
  | { state: "processing" }
  | { state: "failed"; error: string }
  | { state: "completed"; sourceUrl: string };

const MODELS: Record<ConcreteAdProvider, string> = {
  flux: "black-forest-labs/flux-kontext-pro",
  gemini: "gemini-2.5-flash-image",
  openart: "openart-dynamic-image",
};

function providerAspectRatio(value: string) {
  // Meta's canonical landscape ratio is 1.91:1. The connected image
  // providers expose 16:9 instead, which is the closest supported canvas.
  return value === "1.91:1" ? "16:9" : value;
}

export function providerModel(provider: ConcreteAdProvider, requested?: string | null) {
  if (requested && !requested.includes("dynamic")) return requested;
  return MODELS[provider];
}

export function providerFallbackOrder(requested: ConcreteAdProvider): ConcreteAdProvider[] {
  const alternatives: Record<ConcreteAdProvider, ConcreteAdProvider[]> = {
    flux: ["flux", "openart", "gemini"],
    openart: ["openart", "gemini", "flux"],
    gemini: ["gemini", "openart", "flux"],
  };
  return alternatives[requested];
}

export function isProviderConfigurationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /not configured|ikke konfigurert|missing|mangler|not connected|ikke tilkoblet|koble til|unauthorized|forbidden|401|403/i.test(message);
}

export async function submitAdProvider(input: AdProviderInput): Promise<AdProviderSubmission> {
  const model = providerModel(input.provider, input.model);
  const aspectRatio = providerAspectRatio(input.aspectRatio);

  if (input.provider === "gemini") {
    const result = await new GeminiMediaProvider().generateImage({
      prompt: input.prompt,
      sourceImageUrls: [input.productImageUrl],
      aspectRatio,
      qualityTier: input.qualityTier || "balanced",
      model,
      allowText: false,
    });
    if (!result.inlineBase64) throw new Error("Gemini returnerte ingen bildefil.");
    return {
      state: "completed",
      provider: "gemini",
      model: result.model || model,
      bytes: Buffer.from(result.inlineBase64, "base64"),
      mimeType: result.mimeType || "image/png",
      textResponse: result.textResponse,
    };
  }

  if (input.provider === "openart") {
    const historyId = await openArtGenerateImage({
      prompt: input.prompt,
      aspectRatio,
      sourceImageUrls: [input.productImageUrl],
      imageCount: 1,
    });
    return {
      state: "submitted",
      provider: "openart",
      model,
      providerJobId: historyId,
    };
  }

  const prediction = await submitPrediction({
    prompt: input.prompt,
    input_image: input.productImageUrl,
    aspect_ratio: aspectRatio,
    output_format: "png",
  }, 0);
  return {
    state: "submitted",
    provider: "flux",
    model,
    providerJobId: prediction.id,
  };
}

export async function submitAdProviderWithFallback(
  input: AdProviderInput,
  allowFallback: boolean,
): Promise<AdProviderSubmission & { fallbackFrom?: ConcreteAdProvider }> {
  const order = allowFallback ? providerFallbackOrder(input.provider) : [input.provider];
  let lastError: unknown;

  for (const provider of order) {
    try {
      const result = await submitAdProvider({ ...input, provider, model: provider === input.provider ? input.model : null });
      return provider === input.provider ? result : { ...result, fallbackFrom: input.provider };
    } catch (error) {
      lastError = error;
      if (!allowFallback || !isProviderConfigurationError(error)) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Ingen bildegenerator var tilgjengelig.");
}

export async function pollAdProvider(
  provider: ConcreteAdProvider,
  providerJobId: string,
): Promise<AdProviderPollResult> {
  if (provider === "openart") {
    const creation = await getOpenArtCreation(providerJobId);
    if (creation.status === "COMPLETED" && creation.urls.length) {
      return { state: "completed", sourceUrl: creation.urls[0] };
    }
    if (creation.status === "FAILED" || creation.status === "CANCELLED") {
      return { state: "failed", error: creation.failedReason || `OpenArt status=${creation.status}` };
    }
    return { state: "processing" };
  }

  if (provider === "flux") {
    const prediction = await pollPrediction(providerJobId);
    if (prediction.status === "succeeded") {
      const sourceUrl = extractOutputUrl(prediction);
      return sourceUrl
        ? { state: "completed", sourceUrl }
        : { state: "failed", error: "Flux returnerte ingen output-URL." };
    }
    if (prediction.status === "failed" || prediction.status === "canceled") {
      return { state: "failed", error: prediction.error || `Flux status=${prediction.status}` };
    }
    return { state: "processing" };
  }

  return { state: "failed", error: "Gemini-jobber fullføres synkront og kan ikke polles." };
}
