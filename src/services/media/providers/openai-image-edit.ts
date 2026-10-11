import { readBoundedPhoto } from "@/services/marketing/advisor-photo-analysis";
import type { ImageGenerationInput, MediaGenerationJob } from "../types";
function redactOpenAIErrorMessage(message: string) {
  return message
    .replace(/\\bsk-[A-Za-z0-9_-]{12,}\\b/g, "[REDACTED]")
    .replace(/\\b(?:AQ|sess|proj)\\.[A-Za-z0-9_*.-]{12,}\\b/g, "[REDACTED]");
}

const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 
 * Make a single, explicitly requested GPT Image edit with ordered references.
 * The first image is the factual property reference, the second the advisor.
 * No automatic fallback or retry, because each submission may incur charges.
 */
export async function generateOpenAIImageEdit(input: ImageGenerationInput): Promise<MediaGenerationJob> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_IMAGE_NOT_CONFIGURED: OPENAI_API_KEY mangler i Vercel.");
  const refs = input.sourceImageUrls || [];
  if (refs.length < 1 || refs.length > 2) {
    throw new Error("OPENAI_IMAGE_REFERENCES_REQUIRED: Forventet ett eller to referansebilder.");
  }
  const form = new FormData();
  form.append("model", input.model || process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL);
  form.append("prompt", [input.prompt,
    "The FIRST image is the factual property to preserve faithfully. Additional input images only provide approved identity references.",
    input.negativePrompt ? "Avoid: " + input.negativePrompt : "",
  ].filter(Boolean).join("\n\n"));
  form.append("n", "1");
  form.append("quality", input.qualityTier === "premium" ? "high" : "medium");
  form.append("size", input.aspectRatio === "1:1" ? "1024x1024" :
    input.aspectRatio === "16:9" ? "1536x1024" : "1024x1536");
  form.append("output_format", "png");

  // Never hand OpenAI an unverified external URL. The public sources are
  // retrieved with DNS, mime type, maximum-size and redirect safeguards.
  for (const [index, sourceUrl] of refs.entries()) {
    const photo = await readBoundedPhoto(sourceUrl);
    const ext = MIME_EXT[photo.mimeType];
    if (!ext) throw new Error("OPENAI_IMAGE_UNSUPPORTED_REFERENCE_FORMAT");
    const bytes = new Uint8Array(Buffer.from(photo.base64, "base64"));
    form.append("image[]", new Blob([bytes], { type: photo.mimeType }),
      `reference-${index + 1}.${ext}`);
  }

  const response = await fetch(EDIT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(150_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as {
      error?: { code?: string; message?: string };
    };
    const detail = redactOpenAIErrorMessage(String(error.error?.message || error.error?.code ||
      "HTTP " + response.status)).slice(0, 500);
    throw new Error("OPENAI_IMAGE_EDIT_FAILED: " + detail);
  }
  const body = await response.json() as {
    data?: Array<{ b64_json?: string }>;
  };
  const base64 = body.data?.[0]?.b64_json;
  if (!base64) throw new Error("OPENAI_IMAGE_EMPTY_RESULT");
  return {
    provider: "openai",
    status: "completed",
    inlineBase64: base64,
    mimeType: "image/png",
    model: input.model || process.env.OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  };
}
