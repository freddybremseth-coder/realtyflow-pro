import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase er ikke konfigurert" },
        { status: 503 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const draftId = formData.get("draft_id") as string | null;
    const saveToBank = formData.get("save_to_bank") === "true";
    const bankKind = (formData.get("bank_kind") as string | null) || "image";
    const bankOwner = (formData.get("bank_owner") as string | null) || "system";
    const bankName = (formData.get("bank_name") as string | null) || file?.name || null;
    const bankTagsRaw = (formData.get("bank_tags") as string | null) || "";

    if (!file) {
      return NextResponse.json({ error: "Ingen fil valgt" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Ugyldig filtype. Kun JPG, PNG og WebP er tillatt." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Filen er for stor. Maks 10MB." },
        { status: 400 }
      );
    }

    // Generate a unique file name
    const ext = file.name.split(".").pop() || "jpg";
    const safeName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${ext}`;
    const storagePath = `uploads/${safeName}`;

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage bucket "content-images"
    const { error: uploadError } = await supabase.storage
      .from("content-images")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        { error: `Opplasting feilet: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("content-images")
      .getPublicUrl(storagePath);

    const publicUrl = urlData.publicUrl;

    // If a draft_id was provided, update the draft record
    if (draftId) {
      const { error: updateError } = await supabase
        .from("content_publications")
        .update({
          ai_image_url: publicUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);

      if (updateError) {
        console.error("Draft update error:", updateError);
        // Image was uploaded successfully, just return warning
        return NextResponse.json({
          url: publicUrl,
          warning: "Bildet ble lastet opp, men kunne ikke knyttes til utkastet.",
        });
      }
    }

    let bankImage = null;
    if (saveToBank) {
      const validKinds = new Set(["image", "logo", "thumbnail", "product", "variant"]);
      const tags = bankTagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 20);

      const { data: savedImage, error: bankError } = await supabase
        .from("user_image_bank")
        .insert({
          owner: bankOwner,
          url: publicUrl,
          name: bankName,
          kind: validKinds.has(bankKind) ? bankKind : "image",
          tags,
          size_bytes: file.size,
        })
        .select("id, url, name, kind, tags, created_at")
        .single();

      if (bankError) {
        console.error("Image bank save error:", bankError);
      } else {
        bankImage = savedImage;
      }
    }

    return NextResponse.json({ url: publicUrl, success: true, bankImage });
  } catch (error) {
    console.error("Upload image error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opplasting feilet" },
      { status: 500 }
    );
  }
}
