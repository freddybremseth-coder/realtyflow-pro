import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";
import { generateVoiceScript, voiceScriptRequestSchema } from "@/services/media/voice-script";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "voice_script");

    const body = voiceScriptRequestSchema.parse(await request.json());
    const result = await generateVoiceScript(body);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, 400);
  }
}
