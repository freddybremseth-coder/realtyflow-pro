import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

const projectPatchSchema = z.object({
  name: z.string().trim().min(2).max(180).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["draft", "active", "review", "completed", "archived"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request, { project: null, assets: [], jobs: [] });
    if ("error" in context) return context.error;

    const projectId = z.string().uuid().parse(params.id);
    const { data: project, error: projectError } = await context.supabase
      .from("media_projects")
      .select("*")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) {
      return NextResponse.json({ project: null, assets: [], jobs: [], error: "Fant ikke prosjektet." }, { status: 404 });
    }

    const [assetResult, jobResult] = await Promise.all([
      context.supabase
        .from("media_assets")
        .select("*")
        .eq("organization_id", context.scope.organizationId)
        .eq("project_id", projectId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false })
        .limit(120),
      context.supabase
        .from("media_generation_jobs")
        .select("*")
        .eq("organization_id", context.scope.organizationId)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);
    if (assetResult.error) throw new Error(assetResult.error.message);
    if (jobResult.error) throw new Error(jobResult.error.message);

    return NextResponse.json({
      project,
      assets: assetResult.data || [],
      jobs: jobResult.data || [],
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const projectId = z.string().uuid().parse(params.id);
    const body = projectPatchSchema.parse(await request.json());
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.description !== undefined) update.description = body.description;
    if (body.status !== undefined) update.status = body.status;
    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "Ingen prosjektendringer ble sendt." }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from("media_projects")
      .update(update)
      .eq("organization_id", context.scope.organizationId)
      .eq("id", projectId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke prosjektet." }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const projectId = z.string().uuid().parse(params.id);
    const { data: project, error: lookupError } = await context.supabase
      .from("media_projects")
      .select("id,name")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", projectId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!project) return NextResponse.json({ error: "Fant ikke prosjektet." }, { status: 404 });

    // Assets and jobs use ON DELETE SET NULL for project_id. Deleting a project
    // therefore removes organization clutter without destroying generated media.
    const { error } = await context.supabase
      .from("media_projects")
      .delete()
      .eq("organization_id", context.scope.organizationId)
      .eq("id", projectId);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      deletedProjectId: projectId,
      deletedProjectName: project.name,
      mediaPreserved: true,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
