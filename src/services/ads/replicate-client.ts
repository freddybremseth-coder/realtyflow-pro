// ─── Replicate / Flux Kontext Pro client ───────────────────────────────
// Designed for Vercel serverless: each call submits + polls a single
// prediction. Caller does the batching / retry / persistence.

const MODEL = "black-forest-labs/flux-kontext-pro";
const API_URL = `https://api.replicate.com/v1/models/${MODEL}/predictions`;

export interface FluxKontextInput {
  prompt: string;
  input_image: string;            // public URL
  aspect_ratio: string;           // "1:1", "9:16", etc.
  output_format?: "png" | "jpg";
  safety_tolerance?: number;      // 0..6 (Replicate default 2)
}

export interface PredictionResult {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
  created_at?: string;
  completed_at?: string;
}

function getToken(): string {
  const t = process.env.REPLICATE_API_TOKEN;
  if (!t) throw new Error("REPLICATE_API_TOKEN env var is missing");
  return t;
}

/**
 * Submit a Flux Kontext Pro prediction with `Prefer: wait=N`.
 * Returns once Replicate either completes or hands back a prediction ID
 * for later polling.
 */
export async function submitPrediction(
  input: FluxKontextInput,
  waitSeconds = 55
): Promise<PredictionResult> {
  const body = {
    input: {
      prompt: input.prompt,
      input_image: input.input_image,
      aspect_ratio: input.aspect_ratio,
      output_format: input.output_format ?? "png",
      safety_tolerance: input.safety_tolerance ?? 2,
    },
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      Prefer: `wait=${waitSeconds}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout((waitSeconds + 10) * 1000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate submit failed (${res.status}): ${text}`);
  }

  return res.json();
}

export async function pollPrediction(predictionId: string): Promise<PredictionResult> {
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replicate poll failed (${res.status}): ${text}`);
  }
  return res.json();
}

export function extractOutputUrl(p: PredictionResult): string | null {
  if (!p.output) return null;
  return typeof p.output === "string" ? p.output : p.output[0] ?? null;
}

/**
 * Verify the configured token works. Returns the username on success.
 */
export async function verifyToken(): Promise<string> {
  const res = await fetch("https://api.replicate.com/v1/account", {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Token check failed: ${res.status}`);
  const data = (await res.json()) as { username: string };
  return data.username;
}
