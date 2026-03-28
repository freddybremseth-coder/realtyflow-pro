import { NextRequest, NextResponse } from "next/server";

// ─── Image Generation API using Pollinations.ai (free, no API key) ──
// POST /api/image-generate
// Body: { prompt, style?, aspectRatio?, brand? }
// Returns: { imageUrl: string, revisedPrompt: string }

const STYLE_PROMPTS: Record<string, string> = {
  photo: "Photorealistic, high-quality DSLR photography, natural lighting, sharp details, 8k",
  illustration: "Digital illustration, clean lines, vibrant colors, modern graphic design",
  "3d": "3D rendered, cinematic lighting, realistic materials, octane render quality",
  watercolor: "Watercolor painting style, soft edges, artistic brushstrokes, delicate colors",
  minimal: "Minimalist design, clean composition, simple shapes, lots of white space",
  luxury: "Luxury premium aesthetic, elegant, gold accents, sophisticated composition, high-end",
};

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "16:9": { width: 1344, height: 768 },
  "9:16": { width: 768, height: 1344 },
  "4:5": { width: 896, height: 1120 },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      prompt,
      style = "photo",
      aspectRatio = "1:1",
      brand = "",
    } = body;

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid prompt" },
        { status: 400 }
      );
    }

    // Build enhanced prompt
    const styleHint = STYLE_PROMPTS[style] || STYLE_PROMPTS.photo;
    const brandHint = brand ? `For the brand "${brand}".` : "";
    const enhancedPrompt = `${prompt}. ${styleHint}. ${brandHint} No text, letters, words, or watermarks in the image.`.trim();

    const dims = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS["1:1"];

    // Use Pollinations.ai - free image generation API
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${dims.width}&height=${dims.height}&seed=${Date.now()}&nologo=true&enhance=true`;

    // Fetch the image and convert to base64
    const imageRes = await fetch(pollinationsUrl, {
      signal: AbortSignal.timeout(60000), // 60s timeout
    });

    if (!imageRes.ok) {
      return NextResponse.json(
        { error: `Bildegenerering feilet (status ${imageRes.status}). Prøv igjen.` },
        { status: 422 }
      );
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString("base64");
    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const imageUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({
      imageUrl,
      revisedPrompt: enhancedPrompt,
    });
  } catch (error) {
    console.error("[Image Generate] Error:", error);

    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "Bildegenerering tok for lang tid. Prøv igjen med en enklere prompt." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Kunne ikke generere bilde",
      },
      { status: 500 }
    );
  }
}
