import { NextRequest, NextResponse } from "next/server";
import { cancelMediaJob } from "@/services/media/job-service";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const job = await cancelMediaJob(context.supabase, {
      organizationId: context.scope.organizationId,
      jobId: params.id,
    });
    return NextResponse.json({ job });
  } catch (error) {
    return jsonError(error, 400);
  }
}
