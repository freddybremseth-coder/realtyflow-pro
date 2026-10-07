import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";
import { SOCIAL_CATEGORIES } from "@/lib/workspaces/social-strategy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const ALLOWED_DRAFT_PLATFORMS = new Set([
  "facebook","instagram","linkedin","youtube","tiktok","pinterest",
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOCIAL_CATEGORY_SET = new Set<string>(SOCIAL_CATEGORIES);
const SOCIAL_CONCEPT_SET = new Set(["editorial_premium","lifestyle_story","advisor_insight"]);
const SOCIAL_VISUAL_FORMAT_SET = new Set(["single_image","property_card","collage_3","carousel"]);

function fail(status: number, code: string, message?: string) {
  return NextResponse.json(
    { ok: false, error: { code, ...(message ? { message } : {}) } },
    { status, headers: noStore },
  );
}

function safePublication(row: unknown, brandKey: string) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const item = row as Record<string, unknown>;
  if (typeof item.id !== "string" || item.brand_id !== brandKey) return null;
  const status = typeof item.status === "string" ? item.status : "draft";
  if (!["draft","processing","published","scheduled","failed"].includes(status)) return null;
  const tags = Array.isArray(item.tags)
    ? item.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30)
    : [];
  const scheduledPlatforms = Array.isArray(item.scheduled_platforms)
    ? item.scheduled_platforms.filter((platform): platform is string =>
        typeof platform === "string" && ALLOWED_DRAFT_PLATFORMS.has(platform)).slice(0, 10)
    : [];
  return {
    id: item.id,
    contentType: typeof item.content_type === "string" ? item.content_type : "social",
    title: typeof item.title === "string" ? item.title : null,
    description: typeof item.description === "string" ? item.description : null,
    tags,
    thumbnailUrl: typeof item.thumbnail_url === "string" ? item.thumbnail_url : null,
    scheduledPlatforms,
    status,
    scheduledAt: typeof item.scheduled_at === "string" ? item.scheduled_at : null,
    publishedAt: typeof item.published_at === "string" ? item.published_at : null,
    createdAt: typeof item.created_at === "string" ? item.created_at : null,
    updatedAt: typeof item.updated_at === "string" ? item.updated_at : null,
    views: typeof item.total_views === "number" ? item.total_views : 0,
    likes: typeof item.total_likes === "number" ? item.total_likes : 0,
    comments: typeof item.total_comments === "number" ? item.total_comments : 0,
    shares: typeof item.total_shares === "number" ? item.total_shares : 0,
  };
}

function safeWrite(request: NextRequest) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.toLowerCase().startsWith("application/json") &&
    (!origin || origin === new URL(request.url).origin) &&
    request.headers.get("sec-fetch-site") !== "cross-site";
}

async function ownerMarketingSnapshot(supabase: any, brandKey: string) {
  const [{ data: publicationRows, error: publicationError }, { data: channelRows, error: channelError }] =
    await Promise.all([
      supabase
        .from("content_publications")
        .select("id,brand_id,content_type,title,description,tags,thumbnail_url,scheduled_platforms,status,scheduled_at,published_at,created_at,updated_at,total_views,total_likes,total_comments,total_shares")
        .eq("brand_id", brandKey)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(60),
      supabase
        .from("social_channels")
        .select("platform,display_name,is_active")
        .eq("brand_id", brandKey)
        .eq("is_active", true),
    ]);
  if (publicationError || channelError) return null;
  return {
    publications: publicationRows || [],
    channels: channelRows || [],
  };
}

async function ownerImageApproved(
  supabase: any,
  brandKey: string,
  imageUrl: string,
  sourcePropertyId?: string,
) {
  if (!imageUrl) return true;

  const [{ data: publicAsset }, { data: thumbnailAsset }] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id")
      .eq("brand_id", brandKey)
      .eq("public_url", imageUrl)
      .is("deleted_at", null)
      .eq("signed_url_required", false)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("media_assets")
      .select("id")
      .eq("brand_id", brandKey)
      .eq("thumbnail_url", imageUrl)
      .is("deleted_at", null)
      .eq("signed_url_required", false)
      .limit(1)
      .maybeSingle(),
  ]);
  if (publicAsset?.id || thumbnailAsset?.id) return true;

  // Property-origin images are checked against the exact property that the
  // SoMe draft came from. Do not scan an arbitrary capped brand catalogue.
  if (!sourcePropertyId || !UUID_RE.test(sourcePropertyId)) return false;

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id,primary_image,images,gallery,show_on_website,website_visible,status")
    .eq("id", sourcePropertyId)
    .eq("show_on_website", true)
    .eq("website_visible", true)
    .limit(1)
    .maybeSingle();
  if (propertyError || !property?.id) return false;

  const imageBelongsToProperty =
    imageUrl === property.primary_image ||
    (Array.isArray(property.images) && property.images.includes(imageUrl)) ||
    (Array.isArray(property.gallery) && property.gallery.includes(imageUrl));
  if (!imageBelongsToProperty) return false;

  const { data: visibility, error: visibilityError } = await supabase
    .from("property_brand_visibility")
    .select("property_id")
    .eq("property_id", sourcePropertyId)
    .eq("brand_id", brandKey)
    .eq("visible", true)
    .limit(1)
    .maybeSingle();

  return !visibilityError && visibility?.property_id === sourcePropertyId;
}

async function ownerChannelsActive(supabase: any, brandKey: string, platforms: string[]) {
  if (!platforms.length) return true;
  const { data, error } = await supabase
    .from("social_channels")
    .select("platform")
    .eq("brand_id", brandKey)
    .eq("is_active", true)
    .in("platform", platforms);
  if (error) return false;
  return new Set((data || []).map((row: any) => row.platform)).size === new Set(platforms).size;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.read");
  if (!access.value) return access.response;

  let snapshot: any = null;
  if (!access.value.verifiedUserId) {
    snapshot = await ownerMarketingSnapshot(access.value.supabase, params.brandKey);
    if (!snapshot) return fail(503, "MARKETING_UNAVAILABLE");
  } else {
    const { data, error: snapshotError } = await access.value.supabase.rpc(
      "workspace_brand_marketing_snapshot",
      {
        p_brand_key: params.brandKey,
        p_user_id: access.value.verifiedUserId,
        p_email: access.value.verifiedEmail,
      },
    );
    if (snapshotError || !data || !Array.isArray(data.publications) || !Array.isArray(data.channels)) {
      return fail(503, "MARKETING_UNAVAILABLE");
    }
    snapshot = data;
  }

  const publications = snapshot.publications.flatMap((row: unknown) => {
    const publication = safePublication(row, params.brandKey);
    return publication ? [publication] : [];
  });
  const channels = snapshot.channels.flatMap((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return [];
    const item = row as Record<string, unknown>;
    if (typeof item.platform !== "string" || !ALLOWED_DRAFT_PLATFORMS.has(item.platform) ||
        typeof item.display_name !== "string" || item.is_active !== true) return [];
    return [{ platform: item.platform, name: item.display_name }];
  });
  const summary = { draft: 0, scheduled: 0, published: 0, failed: 0 };
  for (const publication of publications) {
    if (publication && publication.status in summary) {
      summary[publication.status as keyof typeof summary] += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    channels,
    publications,
    recentSummary: summary,
  }, { headers: noStore });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.draft");
  if (!access.value) return access.response;
  if (!safeWrite(request)) return fail(403, "INVALID_REQUEST_ORIGIN");

  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return fail(400, "INVALID_DRAFT");
  const body = input as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const tags = Array.isArray(body.tags)
    ? body.tags.map(tag => String(tag).trim().toLowerCase()).filter(Boolean)
    : [];
  const platforms = Array.isArray(body.platforms)
    ? body.platforms.map(platform => String(platform).trim().toLowerCase()).filter(Boolean)
    : [];
  const requestedImageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  const requestedMediaUrls = Array.isArray(body.mediaUrls)
    ? body.mediaUrls.map(value => String(value).trim()).filter(Boolean)
    : [];
  const mediaUrls = Array.from(new Set([
    ...requestedMediaUrls,
    ...(requestedImageUrl ? [requestedImageUrl] : []),
  ])).slice(0, 10);
  const imageUrl = requestedImageUrl || mediaUrls[0] || "";
  const sourcePropertyId = typeof body.sourcePropertyId === "string" ? body.sourcePropertyId.trim() : "";
  const socialCategory = typeof body.socialCategory === "string" ? body.socialCategory.trim() : "";
  const conceptId = typeof body.conceptId === "string" ? body.conceptId.trim() : "";
  const visualFormat = typeof body.visualFormat === "string" ? body.visualFormat.trim() : "";
  const sourceContentId = typeof body.sourceContentId === "string" ? body.sourceContentId.trim().slice(0, 100) : "";
  const sourceAreaId = typeof body.sourceAreaId === "string" ? body.sourceAreaId.trim().slice(0, 100) : "";
  const strategyPeriodId = typeof body.strategyPeriodId === "string" ? body.strategyPeriodId.trim().slice(0, 100) : "";
  const strategyRecommendationReason = typeof body.strategyRecommendationReason === "string"
    ? body.strategyRecommendationReason.trim().slice(0, 500)
    : "";
  const packageId = typeof body.packageId === "string" ? body.packageId.trim().slice(0, 100) : "";
  const aiGeneratedImage = body.aiGeneratedImage === true;

  if (title.length > 200 || description.length < 1 || description.length > 5000 ||
      imageUrl.length > 2000 || (imageUrl && (!/^https:\/\//i.test(imageUrl) || /\s/.test(imageUrl))) ||
      requestedMediaUrls.length > 10 || new Set(requestedMediaUrls).size !== requestedMediaUrls.length ||
      mediaUrls.some(url => url.length > 2000 || !/^https:\/\//i.test(url) || /\s/.test(url)) ||
      (sourcePropertyId && !UUID_RE.test(sourcePropertyId)) ||
      (socialCategory && !SOCIAL_CATEGORY_SET.has(socialCategory)) ||
      (conceptId && !SOCIAL_CONCEPT_SET.has(conceptId)) ||
      (visualFormat && !SOCIAL_VISUAL_FORMAT_SET.has(visualFormat)) ||
      (packageId && !/^[a-z0-9-]+$/i.test(packageId)) ||
      tags.length > 20 || new Set(tags).size !== tags.length ||
      tags.some(tag => tag.length > 60) ||
      platforms.length > 6 || new Set(platforms).size !== platforms.length ||
      platforms.some(platform => !ALLOWED_DRAFT_PLATFORMS.has(platform))) {
    return fail(400, "INVALID_DRAFT");
  }
  if (platforms.includes("instagram") && !imageUrl) {
    return fail(400, "INSTAGRAM_IMAGE_REQUIRED", "Instagram-utkast må ha et brand-godkjent bilde.");
  }

  if (mediaUrls.length > 1) {
    const approvals = await Promise.all(
      mediaUrls.map(url => ownerImageApproved(access.value.supabase, params.brandKey, url, sourcePropertyId)),
    );
    if (approvals.some(approved => !approved)) {
      return fail(409, "IMAGE_NOT_APPROVED_FOR_BRAND",
        "Ett eller flere karusellbilder er ikke registrert som godkjent brand-media.");
    }
  }

  let data: any = null;
  if (!access.value.verifiedUserId) {
    if (!(await ownerChannelsActive(access.value.supabase, params.brandKey, platforms))) {
      return fail(409, "CHANNEL_NOT_ACTIVE_FOR_BRAND");
    }
    if (imageUrl && !(await ownerImageApproved(access.value.supabase, params.brandKey, imageUrl, sourcePropertyId))) {
      return fail(409, "IMAGE_NOT_APPROVED_FOR_BRAND",
        "Bildeadressen er ikke knyttet til en synlig eiendom eller godkjent mediefil for denne merkevaren.");
    }
    const { data: publication, error: insertError } = await access.value.supabase
      .from("content_publications")
      .insert({
        brand_id: params.brandKey,
        content_type: "social",
        title: title || null,
        description,
        tags,
        thumbnail_url: imageUrl || null,
        ai_image_url: imageUrl || null,
        media_urls: mediaUrls,
        scheduled_platforms: platforms,
        status: "draft",
        ai_generated: aiGeneratedImage,
        content_features: {
          workspace_draft: true,
          owner_draft: true,
          workspace_actor_email: access.value.verifiedEmail,
          ...(socialCategory ? {
            social_category: socialCategory,
            is_property_presentation: socialCategory === "property",
          } : {}),
          ...(conceptId ? { concept_id: conceptId } : {}),
          ...(visualFormat ? { visual_format: visualFormat } : {}),
          ...(sourcePropertyId ? { source_property_id: sourcePropertyId } : {}),
          ...(sourceContentId ? { source_content_id: sourceContentId } : {}),
          ...(sourceAreaId ? { source_area_id: sourceAreaId } : {}),
          ...(strategyPeriodId ? { strategy_period_id: strategyPeriodId } : {}),
          ...(strategyRecommendationReason ? {
            strategy_recommendation_reason: strategyRecommendationReason,
          } : {}),
          ...(packageId ? { social_package_id: packageId } : {}),
          ...(aiGeneratedImage ? { ai_generated_image: true } : {}),
        },
      })
      .select("id,brand_id,content_type,title,description,tags,thumbnail_url,scheduled_platforms,status,scheduled_at,published_at,created_at,updated_at,total_views,total_likes,total_comments,total_shares")
      .single();
    if (insertError || !publication) return fail(503, "MARKETING_DRAFT_CREATE_FAILED");
    data = { ok: true, publication };
  } else {
    const result = await access.value.supabase.rpc(
      "workspace_brand_marketing_draft_create_v2",
      {
        p_brand_key: params.brandKey,
        p_user_id: access.value.verifiedUserId,
        p_email: access.value.verifiedEmail,
        p_title: title,
        p_description: description,
        p_tags: tags,
        p_platforms: platforms,
        p_image_url: imageUrl || null,
      },
    );
    if (result.error) return fail(503, "MARKETING_DRAFT_CREATE_FAILED");
    data = result.data;
  }
  if (data?.ok === false && data?.error === "CHANNEL_NOT_ACTIVE_FOR_BRAND") {
    return fail(409, "CHANNEL_NOT_ACTIVE_FOR_BRAND");
  }
  if (data?.ok === false && data?.error === "INSTAGRAM_IMAGE_REQUIRED") {
    return fail(400, "INSTAGRAM_IMAGE_REQUIRED", "Instagram-utkast må ha et bilde som RealtyFlow kan knytte til denne merkevaren.");
  }
  if (data?.ok === false && data?.error === "IMAGE_NOT_APPROVED_FOR_BRAND") {
    return fail(409, "IMAGE_NOT_APPROVED_FOR_BRAND",
      "Bildeadressen er ikke knyttet til en synlig eiendom eller godkjent mediefil for denne merkevaren.");
  }
  const publication = safePublication(data?.publication, params.brandKey);
  if (!data?.ok || !publication) return fail(503, "MARKETING_DRAFT_CREATE_FAILED");

  // The workspace RPC historically stored only thumbnail_url. Mirror approved
  // media into the canonical Content Hub image fields so list cards, publishing
  // and later media selection all see the same asset.
  if (imageUrl) {
    await access.value.supabase
      .from("content_publications")
      .update({
        thumbnail_url: imageUrl,
        ai_image_url: imageUrl,
        media_urls: mediaUrls,
        ai_generated: aiGeneratedImage,
      })
      .eq("id", publication.id)
      .eq("brand_id", params.brandKey);
  }

  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    publication,
    published: false,
  }, { status: 201, headers: noStore });
}
