import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const VALID_STATUSES = new Set(["draft", "processing", "published", "scheduled", "failed"]);

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function limitFrom(request: NextRequest, fallback: number, max: number) {
  const parsed = Number(request.nextUrl.searchParams.get("limit") || fallback);
  return Math.min(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback, max);
}

async function countStatus(supabase: NonNullable<ReturnType<typeof getSupabase>>, status: string) {
  const { count } = await supabase
    .from("content_publications")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  return count || 0;
}

async function getDashboardPayload(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const [published, scheduled, draft, recentRes, failedRes, brandRes] = await Promise.all([
    countStatus(supabase, "published"),
    countStatus(supabase, "scheduled"),
    countStatus(supabase, "draft"),
    supabase
      .from("content_publications")
      .select("title, status, brand_id, created_at, published_at, scheduled_at")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("content_publications")
      .select("id, title, brand_id, last_publish_error, publish_attempts, updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase
      .from("content_publications")
      .select("brand_id,status")
      .order("updated_at", { ascending: false })
      .limit(500),
  ]);

  return {
    counts: { published, scheduled, draft },
    recent: recentRes.data || [],
    failed: failedRes.data || [],
    brandItems: brandRes.data || [],
  };
}

async function getAnalyticsPayload(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const [published, scheduled, draft, allPubsRes, engagementPubsRes, snapshotsRes] = await Promise.all([
    countStatus(supabase, "published"),
    countStatus(supabase, "scheduled"),
    countStatus(supabase, "draft"),
    supabase
      .from("content_publications")
      .select("id, brand_id, tags, status, created_at, published_at")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("content_publications")
      .select("id, title, brand_id, tags, published_at, total_likes, total_comments, total_shares, total_views")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from("engagement_snapshots")
      .select("publication_id, platform, likes, comments, shares, reach, impressions, snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(500),
  ]);

  return {
    counts: { published, scheduled, draft },
    publications: allPubsRes.data || [],
    engagementPublications: engagementPubsRes.data || [],
    engagementSnapshots: snapshotsRes.data || [],
  };
}

async function getCalendarPayload(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const [timelineRes, allPubsRes, topPubsRes, snapshotsRes, recentPublishedRes] = await Promise.all([
    supabase
      .from("content_publications")
      .select("id, title, brand_id, tags, scheduled_at, published_at, status, created_at")
      .in("status", ["scheduled", "published"])
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("content_publications")
      .select("id, brand_id, tags, status")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("content_publications")
      .select("title, brand_id, tags, status, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("engagement_snapshots")
      .select("publication_id, platform, likes, comments, shares, reach, impressions, snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1000),
    supabase
      .from("content_publications")
      .select("id, title, brand_id, tags, published_at, created_at, total_likes, total_comments, total_shares, total_views")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(120),
  ]);

  const trackedPublicationIds = Array.from(
    new Set((snapshotsRes.data || []).map((snap) => snap.publication_id).filter(Boolean)),
  );
  let trackedPublications: unknown[] = [];
  if (trackedPublicationIds.length > 0) {
    const trackedRes = await supabase
      .from("content_publications")
      .select("id, title, brand_id, tags, published_at, created_at, total_likes, total_comments, total_shares, total_views")
      .in("id", trackedPublicationIds);
    trackedPublications = trackedRes.data || [];
  }

  const allPubs = allPubsRes.data || [];
  return {
    timelinePublications: timelineRes.data || [],
    counts: {
      total: allPubs.length,
      published: allPubs.filter((row) => row.status === "published").length,
      failed: allPubs.filter((row) => row.status === "failed").length,
      scheduled: allPubs.filter((row) => row.status === "scheduled").length,
    },
    summaryPublications: allPubs,
    topPublications: topPubsRes.data || [],
    engagementSnapshots: snapshotsRes.data || [],
    recentPublished: recentPublishedRes.data || [],
    trackedPublications,
  };
}

async function getImagesPayload(supabase: NonNullable<ReturnType<typeof getSupabase>>, request: NextRequest) {
  const brandId = request.nextUrl.searchParams.get("brandId")?.trim();
  let query = supabase
    .from("content_publications")
    .select("id, brand_id, content_type, title, description, tags, ai_generated, ai_image_url, thumbnail_url, status, created_at, scheduled_platforms")
    .not("ai_image_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(limitFrom(request, 50, 100));

  if (brandId) query = query.eq("brand_id", brandId);

  const { data, error } = await query;
  if (error) throw error;
  return { publications: data || [] };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdminApi(request, { publications: [], counts: {} });
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });
  }

  try {
    const mode = request.nextUrl.searchParams.get("mode") || "dashboard";
    if (mode === "dashboard") return NextResponse.json(await getDashboardPayload(supabase));
    if (mode === "analytics") return NextResponse.json(await getAnalyticsPayload(supabase));
    if (mode === "calendar") return NextResponse.json(await getCalendarPayload(supabase));
    if (mode === "images") return NextResponse.json(await getImagesPayload(supabase, request));

    return NextResponse.json({ error: "Ukjent visning" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke hente publiseringsdata" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (body.status !== undefined) {
    const status = String(body.status || "").trim();
    if (status === "archived") {
      updates.archive_status = "archived";
      updates.archived_at = now;
    } else {
      if (!VALID_STATUSES.has(status)) {
        return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
      }
      updates.status = status;
      if (status === "draft") {
        updates.last_publish_error = null;
      }
    }
  }

  if (body.title !== undefined) updates.title = String(body.title || "").trim();
  if (body.description !== undefined) updates.description = String(body.description || "");

  if (Object.keys(updates).length <= 1) {
    return NextResponse.json({ error: "Ingen endringer sendt inn" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("content_publications")
    .update(updates)
    .eq("id", id)
    .select("id, brand_id, content_type, title, description, tags, ai_generated, ai_image_url, thumbnail_url, status, created_at, scheduled_at, scheduled_platforms")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ publication: data });
}

export async function DELETE(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });
  }

  const id = String(request.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });

  const { error } = await supabase.from("content_publications").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
