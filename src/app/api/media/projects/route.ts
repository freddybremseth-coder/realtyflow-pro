import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

const projectSchema = z.object({
  name: z.string().min(2).max(180),
  description: z.string().max(2000).optional(),
  projectType: z.string().max(80).default("general"),
  brandId: z.string().max(80).optional(),
  campaignId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  targetPlatforms: z.array(z.string()).default([]),
  targetAudience: z.string().max(500).optional(),
  deadline: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { projects: [] });
    if ("error" in context) return context.error;

    const { data, error } = await context.supabase
      .from("media_projects")
      .select("*, media_assets!media_assets_project_id_fkey(id,thumbnail_url,public_url,media_type,created_at)")
      .eq("organization_id", context.scope.organizationId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(80);
    if (error) throw new Error(error.message);
    return NextResponse.json({ projects: data || [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request);
    if ("error" in context) return context.error;

    const body = projectSchema.parse(await request.json());
    const { data, error } = await context.supabase
      .from("media_projects")
      .insert({
        organization_id: context.scope.organizationId,
        user_id: context.scope.userId,
        name: body.name,
        description: body.description || null,
        project_type: body.projectType,
        brand_id: body.brandId || null,
        campaign_id: body.campaignId || null,
        property_id: body.propertyId || null,
        target_platforms: body.targetPlatforms,
        target_audience: body.targetAudience || null,
        deadline: body.deadline || null,
        status: "active",
        metadata_json: { actorEmail: context.scope.actorEmail },
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
