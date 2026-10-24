import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/api-admin";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const BUCKET = "content-images";
const MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export async function POST(req: NextRequest) {
  const denied = await requireAdminApi(req);
  if (denied) return denied;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const propertyId = form?.get("propertyId");
  if (typeof propertyId !== "string" || !/^[0-9a-f-]{36}$/i.test(propertyId))
    return NextResponse.json({ error: "Ugyldig bolig-ID" }, { status: 400 });
  if (!(file instanceof File) || !MIME[file.type] || file.size <= 0 || file.size > 8 * 1024 * 1024)
    return NextResponse.json({ error: "Bruk JPG, PNG eller WebP, maks 8 MB" }, { status: 400 });
  const client = createServerClient();
  const { data: property, error: lookupError } = await client.from("properties").select("id").eq("id", propertyId).maybeSingle();
  if (lookupError || !property) return NextResponse.json({ error: "Bolig finnes ikke" }, { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const valid = file.type === "image/png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    || file.type === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    || file.type === "image/webp" && bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
  if (!valid) return NextResponse.json({ error: "Filen samsvarer ikke med bildeformatet" }, { status: 400 });
  const path = `properties/${propertyId}/floorplans/${randomUUID()}.${MIME[file.type]}`;
  const { error } = await client.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (error) return NextResponse.json({ error: "Opplasting mislyktes" }, { status: 500 });
  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
