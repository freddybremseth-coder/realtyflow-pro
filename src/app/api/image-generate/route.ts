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

    const genAI = new GoogleGenerativeAI(apiKey);

    // Use Gemini 2.0 Flash with image generation
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        // @ts-expect-error - responseModalities is supported but not yet in types
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const result = await model.generateContent(
      `Generate a high-quality image: ${enhancedPrompt}`
    );

    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts || [];

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
      // Fallback: try Imagen 3 model directly
      try {
        const imagenModel = genAI.getGenerativeModel({
          model: "imagen-3.0-generate-002",
        });

        const imagenResult = await imagenModel.generateContent(enhancedPrompt);
        const imagenParts = imagenResult.response.candidates?.[0]?.content?.parts || [];

        for (const part of imagenParts) {
          if (part.inlineData) {
            imageBase64 = part.inlineData.data;
            mimeType = part.inlineData.mimeType || "image/png";
          }
        }
      } catch (imagenError) {
        console.error("[Image Generate] Imagen fallback failed:", imagenError);
      }
    }

    if (!imageBase64) {
      return NextResponse.json(
        {
          error: "Could not generate image. The model may not support image generation with your current API plan.",
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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate image",
      },
      { status: 500 }
    );
  }
}
