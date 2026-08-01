import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";
import { discoverOpenArtVoiceBridgeOptions } from "@/services/media/openart-voice-bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { options: [], available: false });
    if ("error" in context) return context.error;
    const force = request.nextUrl.searchParams.get("refresh") === "true";
    if (force) assertMediaRateLimit(context.scope.actorEmail, "capability_refresh");

    const discovered = await discoverOpenArtVoiceBridgeOptions({ force });
    const options = discovered?.options || [];
    return NextResponse.json({
      available: options.length > 0,
      rawModelModeCount: discovered?.rawCount || 0,
      options: options.map(({ formSchema: _formSchema, ...option }) => option),
      message: options.length
        ? undefined
        : "OpenArt-kontoen rapporterer foreløpig ingen modell/mode med både lyd- og visuell referansestøtte gjennom MCP.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
