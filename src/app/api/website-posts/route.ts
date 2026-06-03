export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

/**
 * CMS for publisert nettside-innhold (website_posts).
 * Admin-only (middleware setter x-admin-authenticated etter verifisert cookie).
 * GET = list alle · POST = opprett · PATCH = oppdater · DELETE = slett.
 */

function requireAdmin(req: NextRequest) {
  return req.headers.get("x-admin-authenticated") === "true";
}

const EDITABLE = [
  "brand_id",
  "destination_id",
  "destination_label",
  "destination_path",
  "content_type",
  "title",
  "slug",
  "summary",
  "markdown",
  "image_url",
  "tags",
  "status",
  "published_at",
] as const;

function pick(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) out[key] = body[key];
  }
  // tags: godta komma-separert streng eller array
  if (typeof out.tags === "string") {
    out.tags = (out.tags as string).split(",").map((t) => t.trim()).filter(Boolean);
  }
  return out;
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("website_posts")
    .select(
      "id, brand_id, destination_id, destination_label, destination_path, content_type, title, slug, summary, markdown, image_url, tags, status, published_at, created_at, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data || [] });
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const payload = pick(body);
  if (!payload.title || !payload.slug) {
    return NextResponse.json({ error: "title og slug er påkrevd" }, { status: 400 });
  }
  if (payload.markdown === undefined) payload.markdown = "";
  const { data, error } = await supabase
    .from("website_posts")
    .insert({ source_system: "cms", source_type: "manual", ...payload })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });
  const payload = pick(body);
  payload.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("website_posts")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}

export async function DELETE(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerClient();
  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id er påkrevd" }, { status: 400 });
  const { error } = await supabase.from("website_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
