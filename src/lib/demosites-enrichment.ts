/**
 * DemoSites enrichment — turns a bare demo order into a site that feels like
 * the customer's own.
 *
 * Three independent, individually fail-safe steps:
 *
 *   1. Snapshot  — a light, SSRF-guarded fetch of the customer's existing
 *                  homepage: headings, text snippets, image candidates and
 *                  contact info. (The heavy multi-page crawler stays in the
 *                  admin profile-import route; this is the fast public-flow
 *                  version.)
 *   2. AI copy   — hero/intro/services/trust/FAQ written by the AI from the
 *                  snapshot + form input, so the demo talks about the
 *                  customer's actual business instead of template prose.
 *   3. AI images — when the customer has fewer than 3 usable photos, we
 *                  generate industry-matched marketing images in their brand
 *                  colors (Gemini image REST, same backend as
 *                  /api/image-generate) and persist them to Supabase storage.
 *
 * Plus a zero-cost "before" screenshot URL of the old site (thum.io render
 * on demand) used by the before/after slider and the presentation mode.
 *
 * The merge NEVER overwrites content a human wrote: a field is only replaced
 * when it is empty or still equal to the template default.
 */

import { getDemoSiteTemplateDefaults, type DemoSiteFaqItem } from "@/lib/demosites";
import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";
import { askClaude } from "@/services/ai/claude-client";

type SupabaseLike = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

export type DemoSiteWebsiteSnapshot = {
  url: string;
  title: string;
  description: string;
  headings: string[];
  snippets: string[];
  imageCandidates: string[];
  emails: string[];
  phones: string[];
};

export type DemoSiteEnrichmentResult = {
  copyApplied: boolean;
  crawledImages: number;
  generatedImages: number;
  beforeScreenshotUrl: string | null;
  snapshotUsed: boolean;
  errors: string[];
};

const SNAPSHOT_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 900_000;
const MIN_GALLERY_IMAGES = 3;

// Quality gate for crawled photos: small/low-res images from old sites make
// the demo look WORSE than AI-generated ones, so we only keep photos that
// pass these thresholds — the rest are dropped and AI fills the gallery.
const IMAGE_MIN_BYTES = 20_000;
const IMAGE_MAX_BYTES = 8_000_000;
const IMAGE_MIN_WIDTH = 600;
const IMAGE_MIN_HEIGHT = 350;
const IMAGE_MAX_ASPECT = 3.6;
const IMAGE_PROBE_TIMEOUT_MS = 8_000;
const MAX_CRAWLED_IMAGES = 4;

// ─── 0. Before-screenshot (no fetch needed — thum.io renders on demand) ─────

export function buildBeforeScreenshotUrl(websiteUrl?: string | null): string | null {
  const raw = String(websiteUrl || "").trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname.includes(".")) return null;
    return `https://image.thum.io/get/width/1200/noanimate/${parsed.toString()}`;
  } catch {
    return null;
  }
}

// ─── 1. Website snapshot ────────────────────────────────────────────────────

function stripTags(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAll(html: string, pattern: RegExp, group = 1, limit = 20): string[] {
  const out: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  while ((match = re.exec(html)) && out.length < limit) {
    const value = stripTags(match[group] || "").trim();
    if (value) out.push(value);
  }
  return out;
}

function absolutizeUrl(candidate: string, baseUrl: string): string | null {
  try {
    const url = new URL(candidate, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isUsablePhotoUrl(url: string): boolean {
  const lower = url.toLowerCase().split(/[#?]/)[0];
  if (!/\.(jpe?g|png|webp)$/.test(lower) && !/\/(image|img|photo|media|upload)/.test(lower)) return false;
  if (/(logo|favicon|icon|sprite|badge|avatar|placeholder|pixel|tracking|spacer|banner-?ad)/.test(lower)) return false;
  if (/\.svg$/.test(lower)) return false;
  return true;
}

/**
 * Fetch and lightly parse the customer's homepage. Returns null when the URL
 * is missing, invalid, private (SSRF guard) or unreachable — enrichment then
 * simply proceeds without the snapshot.
 */
export async function fetchWebsiteSnapshot(websiteUrl?: string | null): Promise<DemoSiteWebsiteSnapshot | null> {
  const raw = String(websiteUrl || "").trim();
  if (!raw) return null;

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let safeUrl: string;
  try {
    safeUrl = String(await validatePublicWebsiteUrl(withProtocol));
  } catch {
    return null;
  }
  if (!safeUrl) return null;

  try {
    const res = await fetch(safeUrl, {
      signal: AbortSignal.timeout(SNAPSHOT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatGeniusDemoSites/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);

    const title = stripTags(extractAll(html, /<title[^>]*>([\s\S]*?)<\/title>/i, 1, 1)[0] || "");
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ||
      "";

    const headings = extractAll(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i, 1, 14).filter((h) => h.length > 2 && h.length < 140);
    const snippets = extractAll(html, /<p[^>]*>([\s\S]*?)<\/p>/i, 1, 20)
      .filter((p) => p.length > 40 && p.length < 500)
      .slice(0, 10);

    const imageCandidates: string[] = [];
    const ogImage = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (ogImage) {
      const absolute = absolutizeUrl(ogImage, safeUrl);
      if (absolute && isUsablePhotoUrl(absolute)) imageCandidates.push(absolute);
    }
    const imgSrcs = extractAll(html, /<img[^>]+src=["']([^"']+)["']/i, 1, 60);
    for (const src of imgSrcs) {
      const absolute = absolutizeUrl(src, safeUrl);
      if (absolute && isUsablePhotoUrl(absolute) && !imageCandidates.includes(absolute)) {
        imageCandidates.push(absolute);
      }
      if (imageCandidates.length >= 8) break;
    }

    const emails = [...new Set(extractAll(html, /mailto:([^"'?\s>]+)/i, 1, 5))];
    const phones = [...new Set(extractAll(html, /tel:([+0-9() -]{6,20})/i, 1, 5))];

    return { url: safeUrl, title, description, headings, snippets, imageCandidates, emails, phones };
  } catch {
    return null;
  }
}

// ─── 1b. Image quality gate ─────────────────────────────────────────────────

function parsePngDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    // SOF0–SOF15 (excluding DHT/DAC/RST): frame headers carry dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function parseWebpDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8X") {
    return {
      width: 1 + ((buf[26] << 16) | (buf[25] << 8) | buf[24]),
      height: 1 + ((buf[29] << 16) | (buf[28] << 8) | buf[27]),
    };
  }
  if (format === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function parseImageDimensions(buf: Buffer): { width: number; height: number } | null {
  return parsePngDimensions(buf) || parseJpegDimensions(buf) || parseWebpDimensions(buf);
}

/**
 * Download a crawled image candidate and verify it is a real, reasonably
 * large photo. Returns false on any doubt — a rejected image simply means
 * an AI-generated one takes its place, which beats a blurry thumbnail.
 */
export async function probeImageQuality(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_PROBE_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatGeniusDemoSites/1.0)" },
    });
    if (!res.ok) return false;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!/image\/(jpe?g|png|webp)/.test(contentType)) return false;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < IMAGE_MIN_BYTES || buf.length > IMAGE_MAX_BYTES) return false;

    const dims = parseImageDimensions(buf);
    if (!dims || !dims.width || !dims.height) return false;
    if (dims.width < IMAGE_MIN_WIDTH || dims.height < IMAGE_MIN_HEIGHT) return false;

    const aspect = dims.width / dims.height;
    if (aspect > IMAGE_MAX_ASPECT || aspect < 1 / IMAGE_MAX_ASPECT) return false;

    return true;
  } catch {
    return false;
  }
}

/** Filter crawled candidates through the quality gate (parallel, capped). */
export async function selectQualityImages(candidates: string[], max = MAX_CRAWLED_IMAGES): Promise<string[]> {
  const toProbe = candidates.slice(0, 8);
  const results = await Promise.all(toProbe.map(async (url) => ((await probeImageQuality(url)) ? url : null)));
  return results.filter((url): url is string => Boolean(url)).slice(0, max);
}

// ─── 2. AI copy ─────────────────────────────────────────────────────────────

export type DemoSiteGeneratedCopy = {
  hero_title?: string;
  hero_subtitle?: string;
  intro_text?: string;
  services?: string[];
  trust_points?: string[];
  faq?: DemoSiteFaqItem[];
  call_to_action?: string;
  contact_text?: string;
};

function cleanJsonText(text: string) {
  return text.replace(/```json/gi, "").replace(/```/g, "").trim();
}

export async function generateDemoCopy(input: {
  companyName: string;
  industry?: string | null;
  templateSlug: string;
  services: string[];
  notes?: string | null;
  snapshot?: DemoSiteWebsiteSnapshot | null;
}): Promise<DemoSiteGeneratedCopy | null> {
  const snapshotContext = input.snapshot
    ? `
FRA BEDRIFTENS EKSISTERENDE NETTSIDE (bruk dette aktivt — nevn faktiske tjenester og stedsnavn):
Tittel: ${input.snapshot.title}
Beskrivelse: ${input.snapshot.description}
Overskrifter: ${input.snapshot.headings.slice(0, 10).join(" | ")}
Tekstutdrag: ${input.snapshot.snippets.slice(0, 6).join("\n")}`
    : "";

  const prompt = `Du skriver innhold til en ny, moderne nettside for en norsk lokal bedrift. Innholdet skal føles skreddersydd, konkret og selgende — ikke som en mal.

BEDRIFT: ${input.companyName}
BRANSJE: ${input.industry || input.templateSlug}
TJENESTER OPPGITT AV KUNDEN: ${input.services.join(", ") || "(ingen oppgitt)"}
NOTATER: ${input.notes || "(ingen)"}
${snapshotContext}

Skriv på norsk. Vær konkret (bruk bedriftsnavnet og reelle tjenester/steder der du kan), unngå buzzord og superlativ-spam. Returner KUN gyldig JSON:
{
  "hero_title": "kraftfull tittel, maks 60 tegn",
  "hero_subtitle": "undertittel som lover konkret verdi, maks 120 tegn",
  "intro_text": "2-3 setninger om bedriften, varm og troverdig",
  "services": ["4-7 konkrete tjenester"],
  "trust_points": ["3-5 korte trygghetspunkter, f.eks. erfaring, garanti, responstid"],
  "faq": [{"question": "…", "answer": "…"}, {"question": "…", "answer": "…"}, {"question": "…", "answer": "…"}],
  "call_to_action": "kort handlingsdrivende CTA, maks 40 tegn",
  "contact_text": "1-2 setninger som senker terskelen for å ta kontakt"
}`;

  try {
    const text = await askClaude(prompt, {
      maxTokens: 1200,
      temperature: 0.7,
      responseMimeType: "application/json",
    });
    const parsed = JSON.parse(cleanJsonText(text)) as DemoSiteGeneratedCopy;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch (err) {
    console.warn("[DemoSites Enrichment] AI copy failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── 3. AI images ───────────────────────────────────────────────────────────

const INDUSTRY_IMAGE_PROMPTS: Array<{ match: RegExp; prompts: string[] }> = [
  {
    match: /dekk|bilverksted|auto/,
    prompts: [
      "modern car workshop interior, mechanic working on a wheel, clean professional garage, warm lighting",
      "close-up of premium car tires stacked in a tidy workshop, shallow depth of field",
      "friendly mechanic handing car keys to a customer in a bright reception area",
    ],
  },
  {
    match: /restaurant|kafe|cafe|hospitality/,
    prompts: [
      "cozy scandinavian restaurant interior at golden hour, warm ambient light, set tables",
      "beautifully plated nordic dish on a rustic wooden table, soft natural light",
      "barista pouring latte art in a bright modern café, inviting atmosphere",
    ],
  },
  {
    match: /renhold|clean/,
    prompts: [
      "professional cleaner in uniform polishing a bright modern office, sunlight through windows",
      "sparkling clean scandinavian kitchen interior, minimalist, fresh and airy",
      "cleaning team with professional equipment in a modern lobby, trustworthy and tidy",
    ],
  },
  {
    match: /elektro|rorlegger|snekker|bygg|trade|handverk/,
    prompts: [
      "skilled craftsman working on a modern scandinavian house project, professional tools, daylight",
      "close-up of precise electrical or plumbing work, clean installation, professional quality",
      "finished bright renovated interior, scandinavian style, craftsmanship details",
    ],
  },
  {
    match: /tannlege|fysio|klinikk|frisor|skjonnhet|clinic/,
    prompts: [
      "calm modern clinic reception, soft neutral colors, welcoming and clean",
      "professional practitioner with a relaxed smiling client, bright treatment room",
      "minimalist spa-like treatment room details, towels and plants, serene mood",
    ],
  },
  {
    match: /advokat|jus|professional/,
    prompts: [
      "modern law office meeting room, glass and wood, calm professional atmosphere",
      "close-up of a handshake over documents in a bright office, trust and clarity",
      "scandinavian office interior with bookshelves, warm daylight, discreet and premium",
    ],
  },
  {
    match: /hotell|overnatting|stay/,
    prompts: [
      "boutique hotel room with scandinavian design, soft morning light on the bed",
      "hotel breakfast spread by a window with a beautiful nordic view",
      "inviting hotel lobby with fireplace and armchairs, warm evening light",
    ],
  },
  {
    match: /eiendom|megler|property/,
    prompts: [
      "modern scandinavian house exterior at dusk, warm lights in windows, premium real estate photo",
      "bright living room interior staged for sale, large windows, tasteful furniture",
      "real estate agent showing a home to a couple, natural friendly moment",
    ],
  },
  {
    match: /frakt|transport|logistikk/,
    prompts: [
      "clean modern delivery van on a scenic norwegian road, professional livery-free",
      "organized logistics warehouse with neat parcels, bright and efficient",
      "courier delivering a package to a smiling customer at their door",
    ],
  },
];

const DEFAULT_IMAGE_PROMPTS = [
  "modern scandinavian small business storefront, inviting and professional, daylight",
  "friendly team of professionals in a bright modern workspace, candid and trustworthy",
  "close-up of quality craftsmanship or service detail, clean composition, soft light",
];

function getIndustryImagePrompts(templateSlug: string, industry?: string | null): string[] {
  const key = `${templateSlug} ${industry || ""}`.toLowerCase();
  for (const entry of INDUSTRY_IMAGE_PROMPTS) {
    if (entry.match.test(key)) return entry.prompts;
  }
  return DEFAULT_IMAGE_PROMPTS;
}

async function generateOneImage(prompt: string, brandColor: string): Promise<{ base64: string; mimeType: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const fullPrompt = `High-quality professional marketing photograph: ${prompt}. Subtle color accents matching brand color ${brandColor}. Photorealistic, 8k quality, no text, letters, words, logos or watermarks in the image.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 1 },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return { base64: part.inlineData.data, mimeType: part.inlineData.mimeType || "image/png" };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateDemoImages(
  supabase: SupabaseLike,
  input: {
    orderId: string;
    templateSlug: string;
    industry?: string | null;
    brandColor: string;
    count: number;
  },
): Promise<string[]> {
  if (input.count <= 0) return [];
  const prompts = getIndustryImagePrompts(input.templateSlug, input.industry).slice(0, input.count);

  const results = await Promise.all(prompts.map((prompt) => generateOneImage(prompt, input.brandColor)));
  const urls: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const image = results[i];
    if (!image) continue;
    const ext = image.mimeType.includes("jpeg") ? "jpg" : image.mimeType.includes("webp") ? "webp" : "png";
    const path = `demosites/${input.orderId}/ai-${Date.now()}-${i}.${ext}`;
    try {
      const buffer = Buffer.from(image.base64, "base64");
      const { error } = await supabase.storage
        .from("content-images")
        .upload(path, buffer, { contentType: image.mimeType, upsert: true });
      if (error) continue;
      const { data } = supabase.storage.from("content-images").getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    } catch {
      // Individual image failures never break enrichment.
    }
  }

  return urls;
}

// ─── Merge + orchestration ──────────────────────────────────────────────────

function textOf(value: unknown) {
  return String(value ?? "").trim();
}

function listOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => textOf(v)).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  return [];
}

/** A field is replaceable when it's empty or still the untouched template default. */
function isDefaultText(current: unknown, defaultValue: string) {
  const value = textOf(current);
  return !value || value === defaultValue.trim();
}

function isDefaultList(current: unknown, defaultValues: string[]) {
  const values = listOf(current);
  if (!values.length) return true;
  const defaults = new Set(defaultValues.map((v) => v.trim()));
  return values.every((v) => defaults.has(v));
}

export type DemoOrderForEnrichment = {
  id: string;
  company_name: string;
  industry?: string | null;
  website_url?: string | null;
  template_slug?: string | null;
  brand_color?: string | null;
  notes?: string | null;
  editable_fields?: Record<string, unknown> | null;
  extracted_profile?: Record<string, unknown> | null;
};

export type DemoSiteEnrichmentOptions = {
  generateImages?: boolean;
  /**
   * Throw away the current gallery (bad photos from the old site) and build
   * a fresh one from AI-generated images only. Used by "Lag nye bilder".
   */
  regenerateImages?: boolean;
  /** Skip snapshot + AI copy — only touch images. */
  imagesOnly?: boolean;
};

/**
 * Enrich one demo order in place. Every step is optional and fail-safe; the
 * function always returns a result and never throws on content problems.
 */
export async function enrichDemoSiteOrder(
  supabase: SupabaseLike,
  order: DemoOrderForEnrichment,
  options: DemoSiteEnrichmentOptions = {},
): Promise<DemoSiteEnrichmentResult> {
  const errors: string[] = [];
  const fields: Record<string, unknown> = { ...(order.editable_fields || {}) };
  const templateSlug = textOf(fields.template_slug) || textOf(order.template_slug) || "local-service";
  const defaults = getDemoSiteTemplateDefaults(templateSlug, order.company_name);
  const brandColor = textOf(fields.brand_color) || textOf(order.brand_color) || defaults.brand_color;

  // 1. Snapshot of the existing site (also feeds copy + gallery).
  const snapshot = options.imagesOnly ? null : await fetchWebsiteSnapshot(order.website_url).catch(() => null);

  // 2. Before-screenshot for the before/after slider.
  const beforeScreenshotUrl = buildBeforeScreenshotUrl(order.website_url);
  if (beforeScreenshotUrl && !fields.before_screenshot_url) fields.before_screenshot_url = beforeScreenshotUrl;

  // 3. Real images from the old site into the gallery — but only photos
  // that pass the quality gate. A bad old site must not produce a bad demo;
  // rejected images are replaced by AI-generated ones below. With
  // `regenerateImages` the existing gallery is discarded entirely.
  const currentGallery = options.regenerateImages ? [] : listOf(fields.gallery_images);
  const candidates = options.regenerateImages
    ? []
    : (snapshot?.imageCandidates || []).filter((url) => !currentGallery.includes(url));
  const crawledImages = candidates.length ? await selectQualityImages(candidates) : [];
  let gallery = [...currentGallery, ...crawledImages].slice(0, 6);

  // 4. AI copy from snapshot + form input.
  let copyApplied = false;
  const services = listOf(fields.services);
  const copy = options.imagesOnly
    ? null
    : await generateDemoCopy({
        companyName: order.company_name,
        industry: order.industry,
        templateSlug,
        services,
        notes: order.notes,
        snapshot,
      });

  if (copy) {
    if (copy.hero_title && isDefaultText(fields.hero_title, defaults.hero_title)) fields.hero_title = copy.hero_title;
    if (copy.hero_subtitle && isDefaultText(fields.hero_subtitle, defaults.hero_subtitle)) fields.hero_subtitle = copy.hero_subtitle;
    if (copy.intro_text && isDefaultText(fields.intro_text, defaults.intro_text)) fields.intro_text = copy.intro_text;
    if (copy.call_to_action && isDefaultText(fields.call_to_action, defaults.call_to_action)) fields.call_to_action = copy.call_to_action;
    if (copy.contact_text && isDefaultText(fields.contact_text, defaults.contact_text)) fields.contact_text = copy.contact_text;
    if (copy.services?.length && isDefaultList(fields.services, defaults.services)) fields.services = copy.services;
    if (copy.trust_points?.length && isDefaultList(fields.trust_points, defaults.trust_points)) fields.trust_points = copy.trust_points;
    if (Array.isArray(copy.faq) && copy.faq.length >= 2 && (!Array.isArray(fields.faq) || !(fields.faq as unknown[]).length)) {
      fields.faq = copy.faq.filter((item) => item && item.question).slice(0, 6);
    }
    copyApplied = true;
  } else if (!options.imagesOnly) {
    errors.push("ai_copy_failed");
  }

  // 5. AI images when the gallery is thin.
  let generatedImages: string[] = [];
  if (options.generateImages !== false && gallery.length < MIN_GALLERY_IMAGES) {
    generatedImages = await generateDemoImages(supabase, {
      orderId: order.id,
      templateSlug,
      industry: order.industry,
      brandColor,
      count: MIN_GALLERY_IMAGES - gallery.length,
    });
    if (!generatedImages.length) errors.push("ai_images_failed_or_skipped");
    gallery = [...gallery, ...generatedImages].slice(0, 6);
  }

  if (gallery.length) fields.gallery_images = gallery;

  fields.enrichment = {
    at: new Date().toISOString(),
    copy_applied: copyApplied,
    snapshot_used: Boolean(snapshot),
    crawled_images: crawledImages.length,
    generated_images: generatedImages.length,
    errors,
  };

  // Persist.
  const { error: updateError } = await supabase
    .from("demo_site_orders")
    .update({ editable_fields: fields })
    .eq("id", order.id);
  if (updateError) errors.push(`persist_failed: ${updateError.message}`);

  try {
    await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "demo_enriched",
      title: "Demo beriket med ekte innhold",
      description: `AI-tekst: ${copyApplied ? "ja" : "nei"} · bilder fra gammel side: ${crawledImages.length} · AI-bilder: ${generatedImages.length}${snapshot ? " · nettside analysert" : ""}`,
      metadata: fields.enrichment,
    });
  } catch {
    // Event logging is best-effort.
  }

  return {
    copyApplied,
    crawledImages: crawledImages.length,
    generatedImages: generatedImages.length,
    beforeScreenshotUrl,
    snapshotUsed: Boolean(snapshot),
    errors,
  };
}
