import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { getServiceSupabase } from "@/services/marketing/campaign-production";

export const dynamic = "force-dynamic";

/** Personal Facebook umbrella: selected source-backed stories, not an
 * automatic mirror of the Art Instagram account or a private FB profile.
 * Only expose non-secret brand copy and eligible source metadata.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const db = getServiceSupabase();
  if (!db) return NextResponse.json({ error: "SUPABASE_UNAVAILABLE" }, { status: 503 });

  const [brand, stories, page, plan] = await Promise.all([
    db.from("brand_settings").select("settings").eq("brand_id", "freddyb").maybeSingle(),
    db.from("marketing_source_queue")
      .select("id,title,source_id,source_url,status,recommended_channels,payload,created_at,last_planned_at")
      .eq("brand_id", "freddyb").eq("source_type", "creative_spotlight")
      .in("status", ["ready", "drafted"]).order("created_at", { ascending: false }).limit(16),
    db.from("social_channels").select("display_name,external_id,is_active")
      .eq("brand_id", "freddyb").eq("platform", "facebook").eq("is_active", true).limit(2),
    db.from("marketing_brand_growth_plans").select("status,autonomy_mode,posting_strategy")
      .eq("brand_id", "freddyb").maybeSingle(),
  ]);
  const error = brand.error || stories.error || page.error || plan.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 503 });
  const settings = (brand.data?.settings ?? {}) as Record<string, unknown>;
  const pages = page.data ?? [];
  const connectedPage = pages.length === 1 && pages[0].external_id === "1324025764122967"
    ? { name: pages[0].display_name, id: pages[0].external_id } : null;
  return NextResponse.json({
    brandId: "freddyb",
    facebookPage: connectedPage,
    facebookRoutingValid: !!connectedPage,
    approvalRequired: plan.data?.status === "active" && plan.data?.autonomy_mode === "approval_required",
    bioDraft: String(settings.facebook_public_page_bio_draft ?? ""),
    pinnedPostDraft: String(settings.facebook_public_page_pinned_post_draft ?? ""),
    profileCopyIsLiveOnFacebook: false,
    stories: (stories.data ?? []).map((story) => {
      const p = (story.payload ?? {}) as Record<string, unknown>;
      return {
        sourceQueueId: story.id,
        kind: String(p.source_type ?? ""),
        sourceBrand: String(p.source_brand ?? ""),
        title: story.title,
        url: story.source_url,
        status: story.status,
        suggestedCopy: typeof p.suggested_copy === "string" ? p.suggested_copy : "",
        previewUrl: typeof p.approved_art_preview === "string" ? p.approved_art_preview : null,
        createdAt: story.created_at,
        plannedAt: story.last_planned_at,
      };
    }),
  });
}
