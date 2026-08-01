import type { MediaPromptPlan, ProviderCapabilities, ProviderRecommendation } from "./types";
import { supportsCapability } from "./capabilities";

export interface ProviderRoutingDecision {
  provider: "gemini" | "openart";
  displayName: string;
  reason: string;
  estimatedCostTier: ProviderRecommendation["estimatedCostTier"];
  model?: string;
  fallbackUsed: boolean;
}

function byProvider(capabilities: ProviderCapabilities[], provider: string) {
  return capabilities.find((item) => item.provider === provider);
}

function costFor(provider: "gemini" | "openart", plan: MediaPromptPlan): ProviderRecommendation["estimatedCostTier"] {
  if (provider === "gemini") return plan.qualityTier === "premium" ? "medium" : "low";
  if (plan.mediaType === "video") return plan.qualityTier === "premium" ? "premium" : "high";
  return plan.qualityTier === "premium" ? "high" : "medium";
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

  const candidates: Array<"gemini" | "openart"> = preferred === "openart"
    ? ["gemini", "openart"]
    : ["openart", "gemini"];

  for (const candidate of candidates) {
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
