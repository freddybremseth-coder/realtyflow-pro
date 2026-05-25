import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function asCleanString(value: string | null) {
  return value?.trim() || "";
}

function extractDestination(tags: string[] | null) {
  return (tags || []).find((tag) => tag.startsWith("cms:"))?.slice(4) || "";
}

function firstImage(mediaUrls: string[] | null, aiImageUrl: string | null) {
  return mediaUrls?.find(Boolean) || aiImageUrl || null;
}

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });
  }

  const brandId = asCleanString(request.nextUrl.searchParams.get("brand"));
  const destinationId = asCleanString(request.nextUrl.searchParams.get("destination"));
  const slug = asCleanString(request.nextUrl.searchParams.get("slug"));
  const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") || 24), 100);

  if (!brandId) {
    return NextResponse.json({ error: "brand er påkrevd" }, { status: 400 });
  }

  let query = supabase
    .from("content_publications")
    .select("id, brand_id, content_type, title, description, ai_description, tags, media_urls, ai_image_url, status, published_at, created_at, updated_at")
    .eq("brand_id", brandId)
    .eq("status", "published")
    .like("content_type", "website_%")
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(slug ? 1 : limit);

  if (slug) {
    query = query.contains("tags", [`slug:${slug}`]);
  }

  if (destinationId) {
    query = query.contains("tags", [`cms:${destinationId}`]);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data || []).map((row) => {
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const itemSlug = tags.find((tag) => tag.startsWith("slug:"))?.slice(5) || "";
    return {
      id: row.id,
      brand_id: row.brand_id,
      title: row.title || "",
      slug: itemSlug,
      summary: row.ai_description || "",
      markdown: row.description || "",
      destination_id: extractDestination(tags),
      content_type: row.content_type,
      image_url: firstImage(row.media_urls as string[] | null, row.ai_image_url || null),
      published_at: row.published_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      tags,
    };
  });

  if (slug) {
    return NextResponse.json({ item: items[0] || null });
  }

  return NextResponse.json({ items });
}
