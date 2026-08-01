import { NextRequest, NextResponse } from "next/server";
import { getProviderCapabilities } from "@/services/media/capabilities";
import { getMediaApiContext, jsonError } from "@/services/media/api-context";

export const dynamic = "force-dynamic";

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) return 0;
  return result.count || 0;
}

export async function GET(request: NextRequest) {
  try {
    const context = await getMediaApiContext(request, { overview: null });
    if ("error" in context) return context.error;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const org = context.scope.organizationId;

    const [
      totalJobs,
      imageJobs,
      videoJobs,
      activeJobs,
      failedJobs,
      assetsToHub,
      recentProjectsRes,
      recentAssetsRes,
      brandRowsRes,
      usageRowsRes,
      capabilities,
    ] = await Promise.all([
      countQuery(context.supabase.from("media_generation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("created_at", since)),
      countQuery(context.supabase.from("media_generation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("media_type", "image").gte("created_at", since)),
      countQuery(context.supabase.from("media_generation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("media_type", "video").gte("created_at", since)),
      countQuery(context.supabase.from("media_generation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).in("status", ["queued", "submitted", "processing"])),
      countQuery(context.supabase.from("media_generation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("status", "failed").gte("created_at", since)),
      countQuery(context.supabase.from("media_assets").select("id", { count: "exact", head: true }).eq("organization_id", org).not("exported_to_content_hub_at", "is", null).gte("created_at", since)),
      context.supabase.from("media_projects").select("id,name,project_type,brand_id,status,updated_at").eq("organization_id", org).order("updated_at", { ascending: false }).limit(6),
      context.supabase.from("media_assets").select("id,title,media_type,brand_id,provider,thumbnail_url,public_url,created_at").eq("organization_id", org).neq("status", "deleted").order("created_at", { ascending: false }).limit(8),
      context.supabase.from("media_assets").select("brand_id").eq("organization_id", org).neq("status", "deleted").limit(500),
      context.supabase.from("media_usage_events").select("cost_tier,provider,media_type,created_at").eq("organization_id", org).gte("created_at", since).limit(500),
      getProviderCapabilities(context.supabase, org),
    ]);

    const brandCounts = new Map<string, number>();
    for (const row of brandRowsRes.data || []) {
      const brand = String(row.brand_id || "uten-brand");
      brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
    }

    const costCounts = new Map<string, number>();
    for (const row of usageRowsRes.data || []) {
      const tier = String(row.cost_tier || "unknown");
      costCounts.set(tier, (costCounts.get(tier) || 0) + 1);
    }

    return NextResponse.json({
      overview: {
        generatedLast30Days: totalJobs,
        imagesGenerated: imageJobs,
        videosGenerated: videoJobs,
        activeJobs,
        failedJobs,
        sentToContentHub: assetsToHub,
        estimatedAiUsage: Object.fromEntries(costCounts),
        providerStatus: capabilities,
        recentProjects: recentProjectsRes.data || [],
        recentAssets: recentAssetsRes.data || [],
        mostUsedBrands: [...brandCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([brandId, count]) => ({ brandId, count })),
        recommendedNextActions: [
          ...(activeJobs > 0 ? [{ label: "Følg opp aktive jobber", href: "/media-studio?view=jobs" }] : []),
          ...(failedJobs > 0 ? [{ label: "Prøv feilede jobber på nytt", href: "/media-studio?view=jobs&status=failed" }] : []),
          { label: "Lag nytt innhold", href: "/media-studio?view=create" },
          { label: "Send ferdige assets til Content Hub", href: "/media-studio?view=library" },
        ],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
