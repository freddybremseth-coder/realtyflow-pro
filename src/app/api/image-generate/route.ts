import { NextRequest, NextResponse } from "next/server";

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
    const enhancedPrompt = `${prompt}. ${styleHint}. ${ratioHint}. ${brandHint} No text, letters, words, or watermarks in the image.`.trim();

    // Use Gemini 2.5 Flash Image model via REST API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `Generate a high-quality image: ${enhancedPrompt}` },
            ],
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
    const parts = data?.candidates?.[0]?.content?.parts || [];

    let imageBase64 = "";
    let mimeType = "image/png";
    let textResponse = "";

    for (const part of parts) {
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

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    return NextResponse.json({
      imageUrl,
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
