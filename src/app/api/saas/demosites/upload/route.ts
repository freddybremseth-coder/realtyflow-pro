import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { slugifyCompanyName } from "@/lib/demosites";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BUCKET = "demosites-assets";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

type UploadKind = "logo" | "image";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env[["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_")];
  if (!url || !key) return null;
  return createClient(url, key);
}

function getExtension(file: File) {
  const name = file.name.toLowerCase();
  const fromName = name.split(".").pop();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/svg+xml") return "svg";
  return "jpg";
}

function safeKind(value: FormDataEntryValue | null): UploadKind {
  return value === "logo" ? "logo" : "image";
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Supabase server key is not configured" }, { status: 503 });

  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const companyName = String(formData.get("companyName") || formData.get("company_name") || "demo").trim();
    const kind = safeKind(formData.get("kind"));

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(fileValue.type)) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    if (fileValue.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File is too large. Max size is 5 MB." }, { status: 400 });
    }

    const extension = getExtension(fileValue);
    const companySlug = slugifyCompanyName(companyName || "demo");
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${companySlug}/${kind}/${unique}.${extension}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, fileValue, {
      cacheControl: "31536000",
      contentType: fileValue.type,
      upsert: false,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ path, publicUrl: data.publicUrl, bucket: BUCKET });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not upload DemoSites asset" },
      { status: 500 },
    );
  }
}
