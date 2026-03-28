import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Image Generation API using Gemini Imagen ─────────────────────
// POST /api/image-generate
// Body: { prompt, style?, aspectRatio?, brand? }
// Returns: { imageUrl: string (base64 data URL), revisedPrompt: string }

const STYLE_PROMPTS: Record<string, string> = {
  photo: "Photorealistic, high-quality DSLR photography, natural lighting, sharp details",
  illustration: "Digital illustration, clean lines, vibrant colors, modern graphic design",
  "3d": "3D rendered, cinematic lighting, realistic materials, octane render quality",
  watercolor: "Watercolor painting style, soft edges, artistic brushstrokes, delicate colors",
  minimal: "Minimalist design, clean composition, simple shapes, lots of white space",
  luxury: "Luxury premium aesthetic, elegant, gold accents, sophisticated composition, high-end",
};

const ASPECT_RATIO_HINTS: Record<string, string> = {
  "1:1": "square composition",
  "16:9": "wide landscape composition, cinematic",
  "9:16": "tall vertical composition, portrait orientation for mobile/stories",
  "4:5": "slightly tall composition, ideal for Instagram feed",
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY not configured" },
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
        { error: "Missing or invalid prompt" },
        { status: 400 }
      );
    }

    // Build enhanced prompt
    const styleHint = STYLE_PROMPTS[style] || STYLE_PROMPTS.photo;
    const ratioHint = ASPECT_RATIO_HINTS[aspectRatio] || "";
    const brandHint = brand ? `For the brand "${brand}".` : "";

    const enhancedPrompt = `${prompt}. ${styleHint}. ${ratioHint}. ${brandHint} No text or watermarks in the image.`.trim();

    // Use Imagen 3 via REST API directly
    const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

    const imagenRes = await fetch(imagenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt: enhancedPrompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: aspectRatio === "16:9" ? "16:9" : aspectRatio === "9:16" ? "9:16" : aspectRatio === "4:5" ? "3:4" : "1:1",
        },
      }),
    });

    if (!imagenRes.ok) {
      const errData = await imagenRes.json().catch(() => ({}));
      console.error("[Image Generate] Imagen error:", errData);

      // Fallback: try Gemini 2.0 Flash
      const genAI = new GoogleGenerativeAI(apiKey);
      const models = ["gemini-2.0-flash", "gemini-1.5-flash"];
      let textResponse = "";

      for (const modelName of models) {
        try {
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(
            `Describe in vivid detail what this image would look like (do NOT generate an image, just describe it visually): ${enhancedPrompt}`
          );
          textResponse = result.response.text();
          break;
        } catch (e) {
          console.error(`[Image Generate] ${modelName} failed:`, e);
        }
      }

      return NextResponse.json(
        {
          error: `Bildegenerering feilet: ${((errData as Record<string, unknown>)?.error as Record<string, unknown>)?.message || "Imagen 3 ikke tilgjengelig"}. Prøv med en annen prompt.`,
          textResponse,
        },
        { status: 422 }
      );
    }

    const imagenData = await imagenRes.json();
    const predictions = imagenData.predictions || [];

    if (!predictions.length || !predictions[0].bytesBase64Encoded) {
      return NextResponse.json(
        { error: "Ingen bilde generert. Prøv med en annen prompt." },
        { status: 422 }
      );
    }

    const imageBase64 = predictions[0].bytesBase64Encoded;
    const mimeType = predictions[0].mimeType || "image/png";
    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    return NextResponse.json({
      imageUrl,
      revisedPrompt: enhancedPrompt,
    });
  } catch (error) {
    console.error("[Image Generate] Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 }
    );
  }
}
