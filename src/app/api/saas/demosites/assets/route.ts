import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET_NAME = "demosites-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

type UploadedAsset = {
  field: string;
  name: string;
  url: string;
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function safeExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase() || "jpg";
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/svg+xml") return "svg";
  return "jpg";
}

function randomId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const existing = await supabase.storage.getBucket(BUCKET_NAME);
  if (!existing.error) return;

  const created = await supabase.storage.createBucket(BUCKET_NAME, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: Array.from(ALLOWED_TYPES),
  });

  if (created.error && !created.error.message.toLowerCase().includes("already exists")) {
    throw created.error;
  }
}

async function uploadFile(supabase: ReturnType<typeof createClient>, file: File, field: string): Promise<UploadedAsset> {
  if (!ALLOWED_TYPES.has(file.type)) throw new Error(`${file.name} er ikke et støttet bildeformat.`);
  if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} er for stor. Maks 5 MB.`);

  const extension = safeExtension(file);
  const path = `uploads/${new Date().toISOString().slice(0, 10)}/${randomId()}.${extension}`;
  const buffer = await file.arrayBuffer();
  const uploaded = await supabase.storage.from(BUCKET_NAME).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploaded.error) throw uploaded.error;

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
  return { field, name: file.name, url: data.publicUrl };
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    await ensureBucket(supabase);
    const formData = await request.formData();
    const logo = formData.get("logo");
    const gallery = formData.getAll("images").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 3);
    const uploads: UploadedAsset[] = [];

    if (logo instanceof File && logo.size > 0) {
      uploads.push(await uploadFile(supabase, logo, "logo"));
    }

    for (const image of gallery) {
      uploads.push(await uploadFile(supabase, image, "images"));
    }

    return NextResponse.json({
      logoUrl: uploads.find((asset) => asset.field === "logo")?.url || null,
      imageUrls: uploads.filter((asset) => asset.field === "images").map((asset) => asset.url),
      uploads,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload DemoSites assets" },
      { status: 500 },
    );
  }
}
