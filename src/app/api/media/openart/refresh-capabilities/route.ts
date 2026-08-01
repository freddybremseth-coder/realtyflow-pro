import { NextRequest, NextResponse } from "next/server";
import { refreshOpenArtCapabilities, saveProviderCapabilities } from "@/services/media/capabilities";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "capability_refresh");

    const capabilities = await refreshOpenArtCapabilities();
    await saveProviderCapabilities(context.supabase, context.scope.organizationId, capabilities);
    try {
      await context.supabase.from("media_usage_events").insert({
        organization_id: context.scope.organizationId,
        event_type: "capability_refresh",
        provider: "openart",
        metadata_json: { actorEmail: context.scope.actorEmail, status: capabilities.status },
      });
    } catch {
      // Capability refresh should not fail because audit logging is unavailable.
    }
    return NextResponse.json({ capabilities });
  } catch (error) {
    return jsonError(error);
  }
}
