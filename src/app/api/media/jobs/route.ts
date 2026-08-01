import { NextRequest, NextResponse } from "next/server";
import { createMediaJob } from "@/services/media/job-service";
import { createJobRequestSchema } from "@/services/media/types";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";
import { assertMediaRateLimit } from "@/services/media/api-guards";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { jobs: [] });
    if ("error" in context) return context.error;

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 40) || 40, 100);
    const status = request.nextUrl.searchParams.get("status");
    const projectId = request.nextUrl.searchParams.get("projectId");

    let query = context.supabase
      .from("media_generation_jobs")
      .select("*")
      .eq("organization_id", context.scope.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) query = query.eq("status", status);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ jobs: data || [], count: data?.length || 0 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;
    assertMediaRateLimit(context.scope.actorEmail, "generate");

    const body = createJobRequestSchema.parse(await request.json());
    const result = await createMediaJob(context.supabase, {
      organizationId: context.scope.organizationId,
      userId: context.scope.userId,
      actorEmail: context.scope.actorEmail,
      body,
    });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
