import assert from "node:assert/strict";
import test from "node:test";
import { createMediaPromptPlan } from "./prompt-director";
import { routeMediaProvider } from "./provider-router";
import { OpenAIVoiceProvider, redactOpenAIErrorMessage } from "./providers/openai-voice-provider";
import { emptyCapabilities, providerCapabilitiesSchema } from "./types";

test("Prompt Director creates an OpenAI voice plan", () => {
  const plan = createMediaPromptPlan({
    request: "Velkommen til vår presentasjon av Costa Blanca.",
    mode: "guided",
    mediaType: "voice",
    useCase: "voice_over",
    qualityTier: "balanced",
    sourceImageUrls: [],
    allowText: false,
    voiceLanguage: "Norwegian",
    voiceId: "alloy",
    voiceTone: "Warm and professional",
    voiceSpeed: 1,
    outputFormat: "mp3",
  });

  assert.equal(plan.mediaType, "voice");
  assert.equal(plan.operation, "text_to_speech");
  assert.equal(plan.providerRecommendation.provider, "openai");
  assert.equal(plan.voiceLanguage, "Norwegian");
  assert.equal(plan.voiceId, "alloy");
  assert.equal(plan.outputFormat, "mp3");
});

test("provider router selects OpenAI for text to speech", () => {
  const plan = createMediaPromptPlan({
    request: "Dette er et kort manus.",
    mode: "simple",
    mediaType: "voice",
    qualityTier: "fast",
    sourceImageUrls: [],
    allowText: false,
  });

  const openai = providerCapabilitiesSchema.parse({
    ...emptyCapabilities("openai", "OpenAI Voice", "available"),
    voice: { textToSpeech: true, voiceClone: false },
  });
  const decision = routeMediaProvider(plan, [
    emptyCapabilities("gemini", "Gemini", "available"),
    emptyCapabilities("openart", "OpenArt", "available"),
    openai,
  ]);

  assert.equal(decision.provider, "openai");
  assert.equal(decision.fallbackUsed, false);
});

test("OpenAI voice capability is unavailable without an API key", async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const capabilities = await new OpenAIVoiceProvider().getCapabilities();
    assert.equal(capabilities.status, "unavailable");
    assert.equal(capabilities.voice.textToSpeech, false);
  } finally {
    if (previous) process.env.OPENAI_API_KEY = previous;
  }
});

test("OpenAI provider errors never expose API key material", () => {
  const raw = "Incorrect API key provided: AQ.Ab8RN********************************4F3g. You can find your API key at https://platform.openai.com/account/api-keys.";
  const safe = redactOpenAIErrorMessage(raw);
  assert.match(safe, /\[REDACTED\]/);
  assert.doesNotMatch(safe, /Ab8RN/);
  assert.doesNotMatch(safe, /4F3g/);
});
