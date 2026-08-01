import { NextRequest, NextResponse } from "next/server";
import { getProviderCapabilities } from "@/services/media/capabilities";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { capabilities: [] });
    if ("error" in context) return context.error;

    const refreshOpenArt = request.nextUrl.searchParams.get("refresh") === "openart";
    const capabilities = await getProviderCapabilities(context.supabase, context.scope.organizationId, { refreshOpenArt });
    return NextResponse.json({ capabilities });
  } catch (error) {
    return jsonError(error);
  }
}
