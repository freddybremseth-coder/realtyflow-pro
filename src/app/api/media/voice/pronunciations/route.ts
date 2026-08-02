import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import {
  listVoicePronunciations,
  upsertVoicePronunciation,
  voicePronunciationInputSchema,
} from "@/services/media/voice-pronunciations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { pronunciations: [] });
    if ("error" in context) return context.error;

    const brandId = request.nextUrl.searchParams.get("brandId");
    const language = request.nextUrl.searchParams.get("language") || undefined;
    const pronunciations = await listVoicePronunciations(context.supabase, {
      organizationId: context.scope.organizationId,
      brandId,
      language,
      includeInactive: request.nextUrl.searchParams.get("includeInactive") === "true",
    });
    return NextResponse.json({ pronunciations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const input = voicePronunciationInputSchema.parse(await request.json());
    const pronunciation = await upsertVoicePronunciation(context.supabase, {
      organizationId: context.scope.organizationId,
      input,
    });
    return NextResponse.json({ pronunciation }, { status: 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
