import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function isMissingColumn(errorMessage: string, column: string) {
  return new RegExp(`column[^\\n]*${column}[^\\n]*does not exist|${column}[^\\n]*schema cache`, "i").test(errorMessage);
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdminApi(request);
  if (unauthorized) return unauthorized;

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase er ikke konfigurert" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const draftId = String(body.draftId || "").trim();
  const imageUrl = String(body.imageUrl || "").trim();
  const thumbnailUrl = body.thumbnailUrl ? String(body.thumbnailUrl).trim() : null;

  if (!draftId || !imageUrl) {
    return NextResponse.json({ error: "draftId og imageUrl er påkrevd" }, { status: 400 });
  }

  const update = {
    ai_image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
    updated_at: new Date().toISOString(),
  };

  const result = await supabase
    .from("content_publications")
    .update(update)
    .eq("id", draftId)
    .select("id, ai_image_url, thumbnail_url")
    .single();

  if (result.error && isMissingColumn(result.error.message, "thumbnail_url")) {
    const fallback = await supabase
      .from("content_publications")
      .update({ ai_image_url: imageUrl, updated_at: update.updated_at })
      .eq("id", draftId)
      .select("id, ai_image_url")
      .single();

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({ draft: { ...fallback.data, thumbnail_url: null }, missingThumbnailColumn: true });
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: result.data });
}
