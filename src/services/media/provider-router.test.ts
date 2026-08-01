import assert from "node:assert/strict";
import test from "node:test";
import { routeMediaProvider } from "./provider-router";
import { emptyCapabilities, type MediaPromptPlan, type ProviderCapabilities } from "./types";

function plan(overrides: Partial<MediaPromptPlan> = {}): MediaPromptPlan {
  return {
    mediaType: "image",
    operation: "text_to_image",
    useCase: "property",
    originalRequest: "Lag et premium eiendomsbilde for LinkedIn.",
    optimizedPrompt: "SUBJECT: premium Mediterranean property visual with a clear real estate advertising composition.",
    qualityTier: "balanced",
    referenceRequirements: [],
    providerRecommendation: {
      provider: "gemini",
      displayName: "Gemini",
      reason: "Fast image generation.",
      estimatedCostTier: "low",
    },
    safetyNotes: [],
    promptBlocks: {},
    estimatedCostTier: "low",
    ...overrides,
  };
}

function availableGemini(): ProviderCapabilities {
  return {
    ...emptyCapabilities("gemini", "Gemini", "available"),
    image: {
      textToImage: true,
      imageToImage: true,
      inpainting: false,
      outpainting: false,
      upscaling: false,
      backgroundRemoval: false,
    },
  };
}

function availableOpenArt(): ProviderCapabilities {
  return {
    ...emptyCapabilities("openart", "OpenArt", "available"),
    image: {
      textToImage: true,
      imageToImage: true,
      inpainting: true,
      outpainting: true,
      upscaling: true,
      backgroundRemoval: true,
    },
    video: {
      textToVideo: true,
      imageToVideo: true,
      audioGeneration: false,
    },
  };
}

test("routeMediaProvider keeps the preferred provider when it supports the operation", () => {
  const decision = routeMediaProvider(plan(), [availableGemini(), availableOpenArt()]);

  assert.equal(decision.provider, "gemini");
  assert.equal(decision.fallbackUsed, false);
  assert.equal(decision.estimatedCostTier, "low");
});

test("routeMediaProvider falls back when the preferred provider cannot handle video", () => {
  const decision = routeMediaProvider(
    plan({
      mediaType: "video",
      operation: "text_to_video",
      providerRecommendation: {
        provider: "gemini",
        displayName: "Gemini",
        reason: "Preferred by the plan.",
        estimatedCostTier: "low",
      },
    }),
    [availableGemini(), availableOpenArt()],
  );

  assert.equal(decision.provider, "openart");
  assert.equal(decision.fallbackUsed, true);
  assert.equal(decision.estimatedCostTier, "high");
});

test("routeMediaProvider returns a clear unavailable reason when nobody supports the job", () => {
  const decision = routeMediaProvider(
    plan({
      mediaType: "voice",
      operation: "text_to_speech",
    }),
    [availableGemini(), availableOpenArt()],
  );

  assert.equal(decision.provider, "gemini");
  assert.equal(decision.fallbackUsed, false);
  assert.match(decision.reason, /Ingen tilgjengelig provider/);
});
