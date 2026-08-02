import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { deleteVoicePronunciation } from "@/services/media/voice-pronunciations";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    await deleteVoicePronunciation(context.supabase, {
      organizationId: context.scope.organizationId,
      id: params.id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
