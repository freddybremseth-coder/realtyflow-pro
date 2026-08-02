import {
  geminiCapabilities,
} from "../capabilities";
import type {
  ImageGenerationInput,
  MediaGenerationJob,
  MediaProvider,
  ProviderJobStatus,
} from "../types";

async function imageUrlToInlineData(imageUrl: string) {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Ugyldig data-URL for kildebilde");
    return { mimeType: match[1], data: match[2] };
  }

  const url = new URL(imageUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("Kildebildet må være en gyldig HTTP(S)-URL.");
  }

  const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Kunne ikke hente kildebilde (${res.status})`);
  const mimeType = res.headers.get("content-type")?.split(";")[0] || "image/png";
  if (!mimeType.startsWith("image/")) throw new Error("Kildebildet må være et bilde.");
  const buffer = Buffer.from(await res.arrayBuffer());
  return { mimeType, data: buffer.toString("base64") };
}

export class GeminiMediaProvider implements MediaProvider {
  id = "gemini" as const;
  displayName = "Gemini";

  async getCapabilities() {
    return geminiCapabilities();
  }

  async generateImage(input: ImageGenerationInput): Promise<MediaGenerationJob> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY er ikke konfigurert.");

    const canvasInstruction = input.aspectRatio
      ? `Required output composition: ${input.aspectRatio} aspect ratio. Compose the subject and negative space for that canvas; do not merely crop the reference.`
      : "Use a commercially suitable social-media canvas.";
    const sourceInstruction = input.sourceImageUrls?.length
      ? "Use the attached image or images as visual references. Preserve recognizable product identity and do not replace branding unless the prompt explicitly requests it."
      : "No visual reference was supplied.";
    const textInstruction = input.allowText
      ? "Only render text that is explicitly supplied in the prompt."
      : "Do not render random copy, headlines, CTA text, watermarks or invented labels inside the image.";

    const promptParts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [
      {
        text: [
          "Generate a production-ready marketing image from this structured instruction:",
          input.prompt,
          canvasInstruction,
          sourceInstruction,
          textInstruction,
          `Negative prompt: ${input.negativePrompt || "none"}`,
        ].join("\n\n"),
      },
    ];

    for (const sourceUrl of input.sourceImageUrls || []) {
      promptParts.push({ inlineData: await imageUrlToInlineData(sourceUrl) });
    }

    const model = input.model || "gemini-2.5-flash-image";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: promptParts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: input.qualityTier === "fast" ? 0.8 : 1,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = ((errData as Record<string, unknown>)?.error as Record<string, unknown>)?.message || `Status ${res.status}`;
      throw new Error(`Gemini-generering feilet: ${errMsg}`);
    }

    const data = await res.json();
    const responseParts = data?.candidates?.[0]?.content?.parts || [];
    let imageBase64 = "";
    let mimeType = "image/png";
    let textResponse = "";

    for (const part of responseParts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || "image/png";
      }
      if (part.text) textResponse = part.text;
    }

    if (!imageBase64) {
      throw new Error(textResponse || "Gemini genererte ikke et bilde.");
    }

    return {
      provider: this.id,
      status: "completed",
      inlineBase64: imageBase64,
      mimeType,
      textResponse,
      model,
    };
  }

  async getJobStatus(providerJobId: string): Promise<ProviderJobStatus> {
    return {
      providerJobId,
      status: "unknown",
      errorMessage: "Gemini-bildejobber fullføres synkront i RealtyFlow.",
    };
  }
}
