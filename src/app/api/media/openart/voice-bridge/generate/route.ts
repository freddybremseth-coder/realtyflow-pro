import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";
import {
  createOpenArtVoiceBridgeJob,
  openArtVoiceBridgeRequestSchema,
} from "@/services/media/openart-voice-bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "generate");

    const body = openArtVoiceBridgeRequestSchema.parse(await request.json());
    const result = await createOpenArtVoiceBridgeJob(context.supabase, {
      organizationId: context.scope.organizationId,
      userId: context.scope.userId,
      actorEmail: context.scope.actorEmail,
    }, body);

    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
