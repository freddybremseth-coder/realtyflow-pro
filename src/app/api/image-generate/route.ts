import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ─── Image Generation API using Gemini 2.5 Flash Image ──────────────
// POST /api/image-generate
// Body: { prompt, style?, aspectRatio?, brand? }
// Returns: { imageUrl: string (base64 data URL), revisedPrompt: string }

const STYLE_PROMPTS: Record<string, string> = {
  photo: "Photorealistic, high-quality DSLR photography, natural lighting, sharp details, 8k",
  illustration: "Digital illustration, clean lines, vibrant colors, modern graphic design",
  "3d": "3D rendered, cinematic lighting, realistic materials, octane render quality",
  watercolor: "Watercolor painting style, soft edges, artistic brushstrokes, delicate colors",
  minimal: "Minimalist design, clean composition, simple shapes, lots of white space",
  luxury: "Luxury premium aesthetic, elegant, gold accents, sophisticated composition, high-end",
};

const ASPECT_RATIO_HINTS: Record<string, string> = {
  "1:1": "square composition",
  "16:9": "wide landscape composition, cinematic widescreen",
  "9:16": "tall vertical composition, portrait orientation for mobile/stories",
  "4:5": "slightly tall composition, ideal for Instagram feed",
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function imageUrlToInlineData(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Ugyldig data-URL for kildebilde");
    return { mimeType: match[1], data: match[2] };
  }

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Kunne ikke hente kildebilde (${res.status})`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return { mimeType, data: buffer.toString("base64") };
}

async function persistGeneratedImage(imageBase64: string, mimeType: string, brand: string, kind: string, sourceImageUrl?: string) {
  const supabase = getSupabase();
  if (!supabase) return null;

  const ext = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
  const safeBrand = (brand || "generated").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const storagePath = `generated/${safeBrand}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(imageBase64, "base64");

  const { error: uploadError } = await supabase.storage
    .from("content-images")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    console.error("[Image Generate] Persist upload failed:", uploadError);
    return null;
  }

  const { data: urlData } = supabase.storage.from("content-images").getPublicUrl(storagePath);
  const publicUrl = urlData.publicUrl;

  await supabase.from("user_image_bank").insert({
    owner: brand || "system",
    url: publicUrl,
    name: kind === "variant" ? "AI produktvariant" : "AI generert bilde",
    kind,
    tags: sourceImageUrl ? ["variant", "product-reference"] : ["generated"],
  });

  return publicUrl;
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY ikke konfigurert" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const {
      prompt,
      style = "photo",
      aspectRatio = "1:1",
      brand = "",
      sourceImageUrl = "",
      instructions = "",
      persist = false,
      bankKind = "image",
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Mangler prompt" },
        { status: 400 }
      );
    }

    const styleHint = STYLE_PROMPTS[style] || STYLE_PROMPTS.photo;
    const ratioHint = ASPECT_RATIO_HINTS[aspectRatio] || "";
    const brandHint = brand ? `For the brand "${brand}".` : "";
    const variantInstruction = sourceImageUrl
      ? `Use the provided product/reference image as the core subject. Preserve the real product identity, label, package shape, colors, and recognizable details. Create a marketing-ready variant according to these instructions: ${instructions || prompt}.`
      : prompt;
    const noTextInstruction = sourceImageUrl
      ? "Do not invent new label text. Keep existing readable product label details as close as possible."
      : "No text, letters, words, or watermarks in the image.";
    const enhancedPrompt = `${variantInstruction}. ${styleHint}. ${ratioHint}. ${brandHint} ${noTextInstruction}`.trim();

    const promptParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
      { text: `Generate a high-quality image: ${enhancedPrompt}` },
    ];

    if (sourceImageUrl && typeof sourceImageUrl === "string") {
      const inlineData = await imageUrlToInlineData(sourceImageUrl);
      promptParts.push({ inlineData });
    }

    // Use Gemini 2.5 Flash Image model via REST API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: promptParts,
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 1,
        },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      const errMsg = ((errData as Record<string, unknown>)?.error as Record<string, unknown>)?.message || `Status ${geminiRes.status}`;
      console.error("[Image Generate] Gemini error:", errData);
      return NextResponse.json(
        { error: `Bildegenerering feilet: ${errMsg}` },
        { status: 422 }
      );
    }

    const data = await geminiRes.json();
    const responseParts = data?.candidates?.[0]?.content?.parts || [];

    let imageBase64 = "";
    let mimeType = "image/png";
    let textResponse = "";

    for (const part of responseParts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
      }
      if (part.text) {
        textResponse = part.text;
      }
    }

    if (!imageBase64) {
      return NextResponse.json(
        {
          error: "Modellen genererte ikke et bilde. Prøv med en annen prompt.",
          textResponse,
        },
        { status: 422 }
      );
    }

    const persistedUrl = persist
      ? await persistGeneratedImage(imageBase64, mimeType, brand || "system", sourceImageUrl ? "variant" : bankKind, sourceImageUrl)
      : null;
    const imageUrl = persistedUrl || `data:${mimeType};base64,${imageBase64}`;

    return NextResponse.json({
      imageUrl,
      persisted: Boolean(persistedUrl),
      revisedPrompt: enhancedPrompt,
      textResponse,
    });
  } catch (error) {
    console.error("[Image Generate] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Bildegenerering tok for lang tid. Prøv igjen." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Kunne ikke generere bilde" },
      { status: 500 }
    );
  }
}
