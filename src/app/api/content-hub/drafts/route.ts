import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getSupabaseHost() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).host : "";
  } catch {
    return "";
  }
}

const baseColumns = [
  "id",
  "brand_id",
  "content_type",
  "title",
  "description",
  "tags",
  "ai_generated",
  "ai_image_url",
  "status",
  "created_at",
  "scheduled_at",
];

const fullSelect = [...baseColumns, "thumbnail_url", "scheduled_platforms"].join(", ");
const noPlatformsSelect = [...baseColumns, "thumbnail_url"].join(", ");
const noThumbnailSelect = [...baseColumns, "scheduled_platforms"].join(", ");
const minimalSelect = baseColumns.join(", ");

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json(
      {
        error: "Supabase er ikke konfigurert",
        drafts: [],
        supabaseHost: getSupabaseHost(),
      },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10) || 100, 300);
  const statuses = (searchParams.get("statuses") || "draft,scheduled,published,failed")
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);

  async function runQuery(selectClause: string) {
    return supabase!
      .from("content_publications")
      .select(selectClause)
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(limit);
  }

  const initialResult = await runQuery(fullSelect);
  let data = initialResult.data as unknown as Record<string, unknown>[] | null;
  let error = initialResult.error as { message: string } | null;
  let usedFallback = false;
  let missingThumbnail = false;
  let missingPlatforms = false;

  const isMissingColumn = (msg: string, col: string) =>
    new RegExp(`column[^\\n]*${col}[^\\n]*does not exist|${col}[^\\n]*schema cache`, "i").test(msg);

  if (error) {
    missingThumbnail = isMissingColumn(error.message, "thumbnail_url");
    missingPlatforms = isMissingColumn(error.message, "scheduled_platforms");
    let nextSelect: string | null = null;
    if (missingThumbnail && missingPlatforms) nextSelect = minimalSelect;
    else if (missingThumbnail) nextSelect = noThumbnailSelect;
    else if (missingPlatforms) nextSelect = noPlatformsSelect;

    if (nextSelect) {
      const fallback = await runQuery(nextSelect);
      data = (fallback.data as unknown as Record<string, unknown>[] | null)?.map((row) => ({
        ...row,
        ...(missingThumbnail ? { thumbnail_url: null } : {}),
        ...(missingPlatforms ? { scheduled_platforms: [] } : {}),
      })) ?? null;
      error = fallback.error as { message: string } | null;
      usedFallback = true;

      if (error && (missingThumbnail || missingPlatforms)) {
        const minimal = await runQuery(minimalSelect);
        data = (minimal.data as unknown as Record<string, unknown>[] | null)?.map((row) => ({
          ...row,
          thumbnail_url: null,
          scheduled_platforms: [],
        })) ?? null;
        error = minimal.error as { message: string } | null;
      }
    }
  }

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        drafts: [],
        supabaseHost: getSupabaseHost(),
        hint: "Sjekk at content_publications finnes i samme Supabase-prosjekt som Vercel bruker, og at migrasjonene er kjørt der.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    drafts: data ?? [],
    count: data?.length ?? 0,
    supabaseHost: getSupabaseHost(),
    usedFallback,
  });
}
