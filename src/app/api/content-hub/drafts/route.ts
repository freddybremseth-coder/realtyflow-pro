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

const fullSelect = [
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
  "scheduled_platforms",
].join(", ");

const fallbackSelect = [
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
].join(", ");

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
  let data = initialResult.data as Record<string, unknown>[] | null;
  let error = initialResult.error as { message: string } | null;
  let usedFallback = false;

  if (error && /scheduled_platforms|schema cache|column/i.test(error.message)) {
    const fallback = await runQuery(fallbackSelect);
    data = (fallback.data as unknown as Record<string, unknown>[] | null)?.map((row) => ({ ...row, scheduled_platforms: [] })) ?? null;
    error = fallback.error as { message: string } | null;
    usedFallback = true;
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
