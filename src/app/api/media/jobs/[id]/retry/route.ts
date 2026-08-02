import { NextRequest, NextResponse } from "next/server";
import { retryMediaJob } from "@/services/media/job-service";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "retry");

    const { data: existing, error } = await context.supabase
      .from("media_generation_jobs")
      .select("operation")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) return NextResponse.json({ error: "Fant ikke media-jobben." }, { status: 404 });
    if (existing.operation === "openart_voice_bridge") {
      return NextResponse.json({
        error: "OpenArt Voice Bridge-jobber må startes på nytt fra Voice Studio, slik at lyd, visuelt materiale, modellskjema og samtykke valideres på nytt.",
      }, { status: 409 });
    }

    const job = await retryMediaJob(context.supabase, {
      organizationId: context.scope.organizationId,
      actorEmail: context.scope.actorEmail,
      jobId: params.id,
    });
    return NextResponse.json({ job });
  } catch (error) {
    return jsonError(error, 400);
  }
}
