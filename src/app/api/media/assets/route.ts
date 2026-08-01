import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { assets: [] });
    if ("error" in context) return context.error;

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 60) || 60, 120);
    const mediaType = request.nextUrl.searchParams.get("mediaType");
    const brandId = request.nextUrl.searchParams.get("brandId");
    const projectId = request.nextUrl.searchParams.get("projectId");
    const status = request.nextUrl.searchParams.get("status") || "active";
    const favorite = request.nextUrl.searchParams.get("favorite");

    // Do not embed media_projects here. media_assets and media_projects have
    // two valid FK paths (asset.project_id and project.cover_asset_id), and
    // PostgREST can reject embedded selects as ambiguous depending on schema
    // cache state. The Library only needs the asset row and already carries
    // project_id for a separate project lookup when required.
    let query = context.supabase
      .from("media_assets")
      .select("*")
      .eq("organization_id", context.scope.organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") query = query.eq("status", status);
    if (mediaType) query = query.eq("media_type", mediaType);
    if (brandId) query = query.eq("brand_id", brandId);
    if (projectId) query = query.eq("project_id", projectId);
    if (favorite === "true") query = query.eq("is_favorite", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ assets: data || [], count: data?.length || 0 });
  } catch (error) {
    return jsonError(error);
  }
}
