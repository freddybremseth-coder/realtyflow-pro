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
