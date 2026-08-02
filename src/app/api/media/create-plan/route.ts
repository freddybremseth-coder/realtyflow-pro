import { NextRequest, NextResponse } from "next/server";
import { createMediaPromptPlan } from "@/services/media/prompt-director";
import { getProviderCapabilities } from "@/services/media/capabilities";
import { routeMediaProvider } from "@/services/media/provider-router";
import { createPlanRequestSchema, mediaPromptPlanSchema } from "@/services/media/types";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";
import { buildPronunciationInstructions } from "@/services/media/voice-pronunciations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "plan");

    const body = createPlanRequestSchema.parse(await request.json());
    let basePlan = createMediaPromptPlan(body);

    if (basePlan.mediaType === "voice" || basePlan.mediaType === "audio") {
      const pronunciationInstructions = await buildPronunciationInstructions(context.supabase, {
        organizationId: context.scope.organizationId,
        brandId: basePlan.brandId || null,
        language: basePlan.voiceLanguage || "Norwegian",
        text: basePlan.originalRequest,
      });
      if (pronunciationInstructions) {
        basePlan = mediaPromptPlanSchema.parse({
          ...basePlan,
          voiceTone: [basePlan.voiceTone, pronunciationInstructions].filter(Boolean).join(" "),
          promptBlocks: {
            ...basePlan.promptBlocks,
            pronunciationDictionaryApplied: "true",
          },
        });
      }
    }

    const capabilities = await getProviderCapabilities(context.supabase, context.scope.organizationId);
    const decision = routeMediaProvider(basePlan, capabilities);
    const plan = mediaPromptPlanSchema.parse({
      ...basePlan,
      providerRecommendation: {
        ...basePlan.providerRecommendation,
        provider: decision.provider,
        displayName: decision.displayName,
        reason: decision.reason,
        estimatedCostTier: decision.estimatedCostTier,
        model: decision.model || basePlan.providerRecommendation.model,
      },
      estimatedCostTier: decision.estimatedCostTier,
    });

    return NextResponse.json({ plan, capabilities, routing: decision });
  } catch (error) {
    return jsonError(error, 400);
  }
}
