/**
 * Opt-in, single-photo visual suitability check for advisor composites.
 * The photo is supplied only after the authenticated user explicitly requests analysis.
 * This is advisory, not an automated accuracy guarantee or a publication approval.
 */
export type AdvisorPhotoReview = {
  suitable: boolean;
  score: number;
  scene: string;
  placement: "auto" | "left" | "right" | "center";
  reason: string;
  warning: string;
  evaluatedBy: "gemini-vision";
};

function publicPhotoUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname === "169.254.169.254" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
      hostname.includes(":")) {
    throw new Error("ADVISOR_PHOTO_URL_UNSAFE");
  }
  return url;
}

async function readBoundedPhoto(photoUrl: string) {
  const url = publicPhotoUrl(photoUrl);
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(14_000),
    headers: { Accept: "image/jpeg,image/png,image/webp" },
  });
  if (!response.ok || !response.body) throw new Error("ADVISOR_PHOTO_FETCH_FAILED");
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    await response.body.cancel();
    throw new Error("ADVISOR_PHOTO_FORMAT_UNSUPPORTED");
  }
  const maxBytes = 7 * 1024 * 1024;
  const statedBytes = Number(response.headers.get("content-length") || "0");
  if (statedBytes > maxBytes) {
    await response.body.cancel();
    throw new Error("ADVISOR_PHOTO_TOO_LARGE");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("ADVISOR_PHOTO_TOO_LARGE");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (size === 0) throw new Error("ADVISOR_PHOTO_EMPTY");
  return { mimeType, base64: Buffer.concat(chunks).toString("base64") };
}

const placementSet = new Set(["auto", "left", "right", "center"]);

export async function reviewAdvisorPhoto(photoUrl: string): Promise<AdvisorPhotoReview> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("ADVISOR_VISION_NOT_CONFIGURED");
  const source = await readBoundedPhoto(photoUrl);
  const instruction = [
    "Inspect this REAL listing photo for placing a SINGLE real estate advisor as an AI composite.",
    "Assess whether there is a visible physically plausible standing surface with space for a person.",
    "Prioritize believable scale, perspective, shadows, and keeping architecture, views and selling features visible.",
    "Do not imagine unseen floors, extend terraces or alter the actual building.",
    "If no believable placement exists, set suitable=false and score under 45.",
    "Return ONLY a JSON object with suitable (boolean), score (integer 0-100),",
    "scene (short category: terrace, garden, interior, entrance or other),",
    "placement (auto, left, right or center), reason (short Norwegian sentence),",
    "warning (short Norwegian sentence or empty string).",
    "Score suitability for a future composite, NOT beauty or property value.",
  ].join(" ");
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(22_000),
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: instruction },
        { inlineData: { mimeType: source.mimeType, data: source.base64 } },
      ] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
    }),
  });
  if (!response.ok) throw new Error("ADVISOR_VISION_PROVIDER_UNAVAILABLE");
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === "string")?.text;
  if (!text) throw new Error("ADVISOR_VISION_INVALID_RESPONSE");
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { throw new Error("ADVISOR_VISION_INVALID_RESPONSE"); }
  const numericScore = Number(parsed.score);
  if (!Number.isFinite(numericScore)) throw new Error("ADVISOR_VISION_INVALID_RESPONSE");
  const score = Math.max(0, Math.min(100, Math.round(numericScore)));
  const placement = String(parsed.placement || "auto");
  const suitable = parsed.suitable === true && score >= 45;
  return {
    suitable,
    score,
    scene: String(parsed.scene || "other").slice(0, 30),
    placement: suitable && placementSet.has(placement)
      ? placement as AdvisorPhotoReview["placement"]
      : "auto",
    reason: String(parsed.reason || "Vurder plassering manuelt.").slice(0, 240),
    warning: String(parsed.warning || "").slice(0, 240),
    evaluatedBy: "gemini-vision",
  };
}
