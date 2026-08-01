import { NextRequest, NextResponse } from "next/server";
import { refreshMediaJob } from "@/services/media/job-service";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request, { job: null });
    if ("error" in context) return context.error;

    const refresh = request.nextUrl.searchParams.get("refresh") !== "false";
    if (refresh) {
      const job = await refreshMediaJob(context.supabase, {
        organizationId: context.scope.organizationId,
        actorEmail: context.scope.actorEmail,
        jobId: params.id,
      });
      return NextResponse.json({ job });
    }

    const { data, error } = await context.supabase
      .from("media_generation_jobs")
      .select("*, media_assets(*)")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke media-jobben", job: null }, { status: 404 });
    return NextResponse.json({ job: data });
  } catch (error) {
    return jsonError(error);
  }
}
