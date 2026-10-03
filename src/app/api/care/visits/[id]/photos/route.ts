import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApi } from "@/lib/api-admin";
import { isUuid } from "@/lib/care/visit-workflow";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const MAX_SIZE = 12 * 1024 * 1024;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as any;
}

function extension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  const inspectionId = String(params.id || "");
  if (!isUuid(inspectionId)) return NextResponse.json({ error: "Ugyldig inspeksjon." }, { status: 400 });
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase er ikke konfigurert." }, { status: 503 });
  const care = supabase.schema("care");

  try {
    const form = await request.formData();
    const file = form.get("file");
    const itemCode = String(form.get("itemCode") || "").trim().slice(0, 120) || null;
    const caption = String(form.get("caption") || "").trim().slice(0, 500);
    if (!(file instanceof File)) return NextResponse.json({ error: "Velg et bilde." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Kun JPG, PNG, WebP, HEIC og HEIF er tillatt." }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: "Bildet er for stort. Maks 12 MB." }, { status: 400 });

    const { data: inspection, error: inspectionError } = await care.from("kh_inspections").select("id,org_id,property_id,status").eq("id", inspectionId).maybeSingle();
    if (inspectionError) throw inspectionError;
    if (!inspection) return NextResponse.json({ error: "Inspeksjonen ble ikke funnet." }, { status: 404 });
    if (inspection.status !== "draft") return NextResponse.json({ error: "Bilder kan bare legges til under et aktivt tilsyn." }, { status: 409 });

    if (itemCode) {
      const { data: item } = await care.from("kh_inspection_items").select("id").eq("inspection_id", inspectionId).eq("item_code", itemCode).maybeSingle();
      if (!item) return NextResponse.json({ error: "Sjekkpunktet tilhører ikke inspeksjonen." }, { status: 400 });
    }

    const id = randomUUID();
    const path = `${inspection.org_id}/${inspection.property_id}/${inspectionId}/${id}.${extension(file)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage.from("kh-photos").upload(path, buffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
    if (uploadError) throw uploadError;

    const { count } = await care.from("kh_photos").select("id", { count: "exact", head: true }).eq("inspection_id", inspectionId);
    const { data: photo, error: photoError } = await care.from("kh_photos").insert({
      id,
      org_id: inspection.org_id,
      inspection_id: inspectionId,
      item_code: itemCode,
      storage_path: path,
      bytes: file.size,
      taken_at: new Date().toISOString(),
      sort_order: Number(count || 0),
      caption: caption ? { text: caption } : null,
    }).select("*").single();
    if (photoError) {
      await supabase.storage.from("kh-photos").remove([path]);
      throw photoError;
    }
    await care.from("kh_inspections").update({ photo_count: Number(count || 0) + 1 }).eq("id", inspectionId);
    const { data: signed } = await supabase.storage.from("kh-photos").createSignedUrl(path, 3600);
    return NextResponse.json({ success: true, photo: { ...photo, signed_url: signed?.signedUrl || null } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Bildet kunne ikke lastes opp." }, { status: 500 });
  }
}
