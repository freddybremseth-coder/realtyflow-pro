import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  isFavorite: z.boolean().optional(),
  status: z.enum(["active", "review", "archived", "deleted"]).optional(),
  projectId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request, { asset: null });
    if ("error" in context) return context.error;

    const { data, error } = await context.supabase
      .from("media_assets")
      .select("*, media_generation_jobs(*), media_projects(id,name), media_asset_links(*)")
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Fant ikke asseten", asset: null }, { status: 404 });
    return NextResponse.json({ asset: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const body = patchSchema.parse(await request.json());
    const update: Record<string, unknown> = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.isFavorite !== undefined) update.is_favorite = body.isFavorite;
    if (body.status !== undefined) {
      update.status = body.status;
      if (body.status === "deleted") update.deleted_at = new Date().toISOString();
    }
    if (body.projectId !== undefined) update.project_id = body.projectId;
    if (body.tags !== undefined) update.tags = body.tags;

    const { data, error } = await context.supabase
      .from("media_assets")
      .update(update)
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ asset: data });
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

    const { error } = await context.supabase
      .from("media_assets")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("organization_id", context.scope.organizationId)
      .eq("id", params.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
