// ─── GET  /api/plots/:id/assets   →  list assets ──────────────────
// ─── POST /api/plots/:id/assets   →  upload (multipart/form-data) ──
//      file: File (required)
//      title?, description?, kind?, tags? (csv)
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";
import { uploadThumbnail } from "@/services/storage/media";

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/quicktime", "video/webm",
  "application/zip",
];
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

function inferKind(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType === "application/pdf") return "document";
  return "document";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("plot_assets")
    .select("*")
    .eq("plot_id", params.id)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const unauthorized = await requireAdminApi(req);
  if (unauthorized) return unauthorized;

  const supabase = createServerClient();

  const fd = await req.formData();
  const file = fd.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Ingen fil valgt" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Filtype ikke tillatt: ${file.type}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Filen er for stor (maks 50MB)` }, { status: 400 });
  }

  const title = (fd.get("title") as string) || null;
  const description = (fd.get("description") as string) || null;
  const kindOverride = (fd.get("kind") as string) || null;
  const tagsCsv = (fd.get("tags") as string) || "";
  const tags = tagsCsv.split(",").map((t) => t.trim()).filter(Boolean);
  const showOnWebsite = fd.get("show_on_website") === "true";
  const visibleInPortal = fd.get("visible_in_portal") === "true";

  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  const storagePath = `${params.id}/${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase
    .storage
    .from("plot-assets")
    .upload(storagePath, buf, { contentType: file.type, upsert: false });
  if (upErr) return NextResponse.json({ error: `Opplasting feilet: ${upErr.message}` }, { status: 500 });

  const { data: pub } = supabase.storage.from("plot-assets").getPublicUrl(storagePath);
  const thumbnailUrl = await uploadThumbnail(supabase, buf, file.type, storagePath);

  const { data: asset, error: insertErr } = await supabase
    .from("plot_assets")
    .insert({
      plot_id: params.id,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
      storage_path: storagePath,
      public_url: pub.publicUrl,
      thumbnail_url: thumbnailUrl,
      kind: kindOverride ?? inferKind(file.type),
      title,
      description,
      tags,
      show_on_website: showOnWebsite,
      visible_in_portal: visibleInPortal,
    })
    .select()
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ asset }, { status: 201 });
}
