import { NextRequest, NextResponse } from "next/server";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { templates: [] });
    if ("error" in context) return context.error;

    const mediaType = request.nextUrl.searchParams.get("mediaType");
    let query = context.supabase
      .from("media_templates")
      .select("*")
      .or(`organization_id.is.null,organization_id.eq.${context.scope.organizationId}`)
      .eq("active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true });

    if (mediaType) query = query.eq("media_type", mediaType);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ templates: data || [] });
  } catch (error) {
    return jsonError(error);
  }
}
