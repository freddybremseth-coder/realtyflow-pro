// ─── Product image analyzer ────────────────────────────────────────────
// Extracts product_name, label_description, colors, and style from a
// product photo using Claude/Gemini vision. Optionally enriches with
// web research via Anthropic's built-in web_search tool when a brand
// name is confidently identified.
//
// Output is shaped to match the Ad Campaign wizard fields exactly so the
// UI can drop the values straight into the form.

import { askClaudeWithImage, askClaude } from "@/services/ai/claude-client";
import Anthropic from "@anthropic-ai/sdk";

export interface ImageAnalysis {
  product_name: string;            // "Doña Anna Verde Alto olive oil bottle"
  label_description: string;       // Verbatim label content + container description
  brand_hint?: string;             // "Doña Anna" — for web enrichment
  colors: string[];                // ["dark green glass", "cream label", "gold foil"]
  style: string;                   // "elegant Mediterranean, refined feminine"
  category_hint?: string;          // "olive oil", "skincare", "wine", ...
  confidence: "high" | "medium" | "low";
  enriched_with_web?: boolean;
}

const VISION_SYSTEM_PROMPT = `You are an expert brand analyst and packaging copywriter. Given a product photograph, you extract structured information that will be used to brief an AI image generator on how to faithfully reproduce the product in new scenes. Always respond with strict JSON — no preamble, no markdown fences.`;

const VISION_PROMPT = `Analyze this product image and extract:

1. **product_name** — the exact product name as it should appear in image-generation prompts. Format: "<Brand> <Product line/variant> <container type>", e.g. "Doña Anna Verde Alto olive oil bottle" or "Brightland Awake Olive Oil bottle". If you can't read the brand confidently, use the most descriptive label you can ("a slim dark glass bottle of premium olive oil").

2. **label_description** — a verbatim, exhaustive description of EVERY visual detail of the label and container that an AI image model needs to reproduce it faithfully. Include:
   - Label background color/texture (cream, kraft paper, white, foil, etc.)
   - Typography of brand name (color, weight, foil/print, serif/sans)
   - Any illustration or icon (describe in detail)
   - Subtitles or product line names with their visual treatment
   - ALL small text VERBATIM — origin, ingredients, certifications, volume — quote exactly
   - Container: shape, material, color of glass/plastic, cap color/material, any seals
   This field is the most important — be specific and thorough.

3. **brand_hint** — just the brand name (1-3 words) if recognizable, else null.

4. **colors** — array of 3-5 dominant colors describing the product's palette ("dark green glass", "cream label", "gold foil", etc.).

5. **style** — 4-8 words describing the visual style/positioning ("elegant Mediterranean refined feminine", "playful retro pop", "minimalist Scandinavian premium", etc.).

6. **category_hint** — the product category in 1-3 words ("olive oil", "facial serum", "natural wine", "tea blend", etc.).

7. **confidence** — "high" if all label text is clearly readable, "medium" if some details are inferred, "low" if the image is too small/blurry to extract reliably.

Return strict JSON:
{
  "product_name": "...",
  "label_description": "...",
  "brand_hint": "..." or null,
  "colors": ["...", "...", "..."],
  "style": "...",
  "category_hint": "...",
  "confidence": "high|medium|low"
}`;


function parseJson<T>(text: string): T {
  let cleaned = text.trim();
  const m = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) cleaned = m[1].trim();
  try { return JSON.parse(cleaned) as T; } catch {
    const obj = cleaned.match(/\{[\s\S]*\}/);
    if (obj) return JSON.parse(obj[0]) as T;
    throw new Error(`Bad JSON from vision model: ${cleaned.slice(0, 200)}`);
  }
}

async function fetchAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  let mimeType = res.headers.get("content-type") || "image/png";
  // Strip charset if present
  mimeType = mimeType.split(";")[0].trim();
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mimeType)) {
    mimeType = "image/png"; // safe default
  }
  return { base64: buf.toString("base64"), mimeType };
}

/**
 * Analyze a product image and return structured fields ready to drop into
 * the Ad Campaign wizard.
 */
export async function analyzeProductImage(imageUrl: string): Promise<ImageAnalysis> {
  const { base64, mimeType } = await fetchAsBase64(imageUrl);
  const text = await askClaudeWithImage(base64, `${VISION_SYSTEM_PROMPT}\n\n${VISION_PROMPT}`, {
    mimeType,
    maxTokens: 1500,
  });
  const result = parseJson<ImageAnalysis>(text);

  // Sanity defaults
  result.colors = Array.isArray(result.colors) ? result.colors : [];
  result.confidence = result.confidence || "medium";
  return result;
}


/**
 * Second pass: enrich the analysis with REAL web research via Anthropic's
 * built-in web_search tool. Equivalent to running Playwright/WebSearch
 * over the brand's website + competitor pages. Falls back to training-
 * data knowledge if web_search is unavailable on the API key tier.
 */
export async function enrichWithBrandKnowledge(
  analysis: ImageAnalysis
): Promise<ImageAnalysis> {
  if (!analysis.brand_hint || analysis.confidence === "low") return analysis;
  if (!process.env.ANTHROPIC_API_KEY) return analysis;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userPrompt = `I'm preparing an Instagram ad campaign for this product. Search the web for the brand's official site and any prominent reviews to verify and enrich the analysis.

Goals:
1. Confirm the brand and product line names (use the brand's own canonical naming).
2. Add any visual/label details that the photo couldn't show clearly (origin, certifications, hero ingredients, signature glyphs, awards on label).
3. Improve product_name to its full commonly-used form.

Current analysis:
${JSON.stringify(analysis, null, 2)}

After your research, return STRICT JSON matching the same schema:
{
  "product_name": "...",
  "label_description": "...",
  "brand_hint": "...",
  "colors": [...],
  "style": "...",
  "category_hint": "...",
  "confidence": "high|medium|low",
  "enriched_with_web": true
}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 } as never],
      messages: [{ role: "user", content: userPrompt }],
    });

    // Find the final assistant text block (after any tool_use rounds)
    const textBlock = response.content.reverse().find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return analysis;
    const enriched = parseJson<ImageAnalysis>(textBlock.text);
    return { ...analysis, ...enriched, enriched_with_web: true };
  } catch (err) {
    // Common failure: web_search not enabled on this API tier — fall back
    // to training-data enrichment via askClaude
    return await fallbackEnrich(analysis);
  }
}


// Pure-LLM fallback when web_search tool isn't available
async function fallbackEnrich(analysis: ImageAnalysis): Promise<ImageAnalysis> {
  const prompt = `Cross-reference what you know about this brand and add missing label detail (origin, certifications, hero ingredients, signature visual elements) to the label_description. If you don't recognize the brand, return unchanged.

Current analysis:
${JSON.stringify(analysis, null, 2)}

Return strict JSON with the SAME schema. Set "enriched_with_web": false.`;

  try {
    const text = await askClaude(prompt, {
      systemPrompt: "You are a brand researcher. Always respond with strict JSON.",
      maxTokens: 1500,
      temperature: 0.2,
    });
    const enriched = parseJson<ImageAnalysis>(text);
    return { ...analysis, ...enriched, enriched_with_web: false };
  } catch {
    return analysis;
  }
}


export async function analyzeAndEnrich(imageUrl: string): Promise<ImageAnalysis> {
  const base = await analyzeProductImage(imageUrl);
  return enrichWithBrandKnowledge(base);
}
