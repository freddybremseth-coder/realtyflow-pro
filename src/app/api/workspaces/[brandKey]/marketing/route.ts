import { NextRequest, NextResponse } from "next/server";
import { requireBrandWorkspace } from "@/lib/workspaces/require-brand-workspace";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStore = { "Cache-Control": "private, no-store" };
const ALLOWED_DRAFT_PLATFORMS = new Set([
  "facebook","instagram","linkedin","youtube","tiktok","pinterest",
]);

function fail(status: number, code: string) {
  return NextResponse.json({ ok: false, error: { code } }, { status, headers: noStore });
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

export async function GET(
  request: NextRequest,
  { params }: { params: { brandKey: string } },
) {
  const access = await requireBrandWorkspace(request, params.brandKey, "marketing.read");
  if (!access.value) return access.response;

  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
  const { data: snapshot, error: snapshotError } = await access.value.supabase.rpc(
    "workspace_brand_marketing_snapshot",
    {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
    },
  );
  if (snapshotError || !snapshot || !Array.isArray(snapshot.publications) || !Array.isArray(snapshot.channels)) {
    return fail(503, "MARKETING_UNAVAILABLE");
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

  if (title.length > 200 || description.length < 1 || description.length > 5000 ||
      tags.length > 20 || new Set(tags).size !== tags.length ||
      tags.some(tag => tag.length > 60) ||
      platforms.length > 6 || new Set(platforms).size !== platforms.length ||
      platforms.some(platform => !ALLOWED_DRAFT_PLATFORMS.has(platform))) {
    return fail(400, "INVALID_DRAFT");
  }

  if (!access.value.verifiedUserId) return fail(403, "STAFF_ONLY");
  const { data, error } = await access.value.supabase.rpc(
    "workspace_brand_marketing_draft_create",
    {
      p_brand_key: params.brandKey,
      p_user_id: access.value.verifiedUserId,
      p_email: access.value.verifiedEmail,
      p_title: title,
      p_description: description,
      p_tags: tags,
      p_platforms: platforms,
    },
  );
  if (error) return fail(503, "MARKETING_DRAFT_CREATE_FAILED");
  if (data?.ok === false && data?.error === "CHANNEL_NOT_ACTIVE_FOR_BRAND") {
    return fail(409, "CHANNEL_NOT_ACTIVE_FOR_BRAND");
  }
  const publication = safePublication(data?.publication, params.brandKey);
  if (!data?.ok || !publication) return fail(503, "MARKETING_DRAFT_CREATE_FAILED");
  return NextResponse.json({
    ok: true,
    brand: params.brandKey,
    publication,
    published: false,
  }, { status: 201, headers: noStore });
}
