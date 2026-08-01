import type { MediaPromptPlan, ProviderCapabilities, ProviderId, ProviderRecommendation } from "./types";
import { supportsCapability } from "./capabilities";

export interface ProviderRoutingDecision {
  provider: ProviderId;
  displayName: string;
  reason: string;
  estimatedCostTier: ProviderRecommendation["estimatedCostTier"];
  model?: string;
  fallbackUsed: boolean;
}

function byProvider(capabilities: ProviderCapabilities[], provider: string) {
  return capabilities.find((item) => item.provider === provider);
}

function costFor(provider: ProviderId, plan: MediaPromptPlan): ProviderRecommendation["estimatedCostTier"] {
  if (provider === "gemini") return plan.qualityTier === "premium" ? "medium" : "low";
  if (provider === "openai") return plan.qualityTier === "premium" ? "medium" : "low";
  if (plan.mediaType === "video") return plan.qualityTier === "premium" ? "premium" : "high";
  return plan.qualityTier === "premium" ? "high" : "medium";
}

function candidateOrder(plan: MediaPromptPlan, preferred: ProviderId): ProviderId[] {
  const candidates: ProviderId[] = plan.mediaType === "voice" || plan.mediaType === "audio"
    ? [preferred, "openai", "openart"]
    : plan.mediaType === "avatar"
      ? [preferred, "openart"]
      : plan.mediaType === "video"
        ? [preferred, "openart"]
        : [preferred, "gemini", "openart"];
  return [...new Set(candidates)];
}

export function routeMediaProvider(plan: MediaPromptPlan, capabilities: ProviderCapabilities[]): ProviderRoutingDecision {
  const preferred = plan.providerRecommendation.provider;
  const preferredCaps = byProvider(capabilities, preferred);
  if (preferredCaps && supportsCapability(preferredCaps, plan.mediaType, plan.operation)) {
    return {
      provider: preferred,
      displayName: preferredCaps.displayName,
      reason: plan.providerRecommendation.reason,
      estimatedCostTier: costFor(preferred, plan),
      model: plan.providerRecommendation.model,
      fallbackUsed: false,
    };
  }

  for (const candidate of candidateOrder(plan, preferred)) {
    if (candidate === preferred) continue;
    const caps = byProvider(capabilities, candidate);
    if (caps && supportsCapability(caps, plan.mediaType, plan.operation)) {
      return {
        provider: candidate,
        displayName: caps.displayName,
        reason: `${plan.providerRecommendation.displayName} støttet ikke denne jobben nå; ${caps.displayName} kan håndtere oppgaven.`,
        estimatedCostTier: costFor(candidate, plan),
        fallbackUsed: true,
      };
    }
  }

  const reason = plan.mediaType === "video"
    ? "Ingen tilkoblet provider støtter denne videojobben akkurat nå."
    : plan.mediaType === "voice" || plan.mediaType === "audio"
      ? "Ingen tilkoblet provider støtter tekst-til-tale. Konfigurer OPENAI_API_KEY eller en annen voice-provider."
      : plan.mediaType === "avatar"
        ? "Ingen tilkoblet provider støtter avatar eller talking avatar akkurat nå."
        : "Ingen tilgjengelig provider støtter denne genereringen akkurat nå.";

  return {
    provider: preferred,
    displayName: plan.providerRecommendation.displayName,
    reason,
    estimatedCostTier: plan.providerRecommendation.estimatedCostTier,
    model: plan.providerRecommendation.model,
    fallbackUsed: false,
  };
}
