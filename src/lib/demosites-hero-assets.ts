import {
  enrichDemoSiteOrder,
  type DemoOrderForEnrichment,
  type DemoSiteEnrichmentOptions,
  type DemoSiteEnrichmentResult,
} from "@/lib/demosites-enrichment";
import { validatePublicWebsiteUrl } from "@/lib/demosites-profile-import";

type SupabaseLike = {
  from: (table: string) => any;
  storage: { from: (bucket: string) => any };
};

export type HeroImageSource = "video-poster" | "og-image" | "hero-image" | "page-image" | "existing-gallery";

export type HeroImageCandidate = {
  url: string;
  source: HeroImageSource;
  context?: string;
  declaredWidth?: number;
  declaredHeight?: number;
  relatedVideoUrl?: string;
  videoKind?: "direct" | "link";
  score: number;
};

export type HeroVideoCandidate = {
  url: string;
  posterUrl?: string;
  kind: "direct" | "link";
  provider: "html5" | "youtube" | "vimeo";
};

export type ExtractedHeroAssets = {
  images: HeroImageCandidate[];
  videos: HeroVideoCandidate[];
};

export type SelectedHeroAsset = {
  imageUrl: string;
  source: "website" | "video" | "ai" | "gallery";
  videoUrl?: string;
  videoKind?: "direct" | "link";
  width?: number;
  height?: number;
};

const HERO_TIMEOUT_MS = 10_000;
const HERO_MAX_HTML_BYTES = 1_000_000;
const HERO_MIN_BYTES = 60_000;
const HERO_MAX_BYTES = 10_000_000;
const HERO_MIN_WIDTH = 1_100;
const HERO_MIN_HEIGHT = 560;
const HERO_MIN_ASPECT = 1.2;
const HERO_MAX_ASPECT = 2.9;
const HERO_CANDIDATE_LIMIT = 8;

const NON_PHOTO_PATTERN = /(?:^|[-_/\s])(logo|favicon|icon|sprite|badge|avatar|placeholder|pixel|tracking|spacer|certificate|sertifikat|diploma|flyer|brochure|brosjyre|infographic|infografikk|prisliste|price[-_ ]?list|menu|meny|quote|testimonial|review|anmeldelse|screenshot|screen[-_ ]?shot|typography|tekst|text[-_ ]?image|document|pdf[-_ ]?preview|announcement|kampanje|tilbud[-_ ]?banner)(?:[-_.\d/\s]|$)/i;
const PHOTO_POSITIVE_PATTERN = /(?:^|[-_/\s])(hero|cover|masthead|header[-_ ]?image|featured|main[-_ ]?image|background|bakgrunn)(?:[-_.\d/\s]|$)/i;

function text(value: unknown) {
  return String(value || "").trim();
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function unique<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(value);
  }
  return output;
}

function absoluteUrl(value: string | undefined, baseUrl: string) {
  if (!value) return "";
  try {
    const url = new URL(value, baseUrl);
    if (!/[.]([a-z0-9]{2,})(?:$|:)/i.test(url.hostname)) return "";
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function attribute(attrs: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return attrs.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] || "";
}

function numericAttribute(attrs: string, name: string) {
  const value = Number(attribute(attrs, name));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function largestSrcsetUrl(srcset: string) {
  const candidates = srcset
    .split(",")
    .map((part) => {
      const [url, descriptor = ""] = part.trim().split(/\s+/, 2);
      const width = descriptor.endsWith("w") ? Number(descriptor.slice(0, -1)) : 0;
      return { url, width: Number.isFinite(width) ? width : 0 };
    })
    .filter((item) => item.url)
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url || "";
}

function youtubeVideoId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (parsed.hostname.includes("youtube.com")) {
      const embed = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1];
      return embed || parsed.searchParams.get("v") || "";
    }
  } catch {
    return "";
  }
  return "";
}

export function isDirectHeroVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(mp4|webm|ogg)(?:$|[?#])/i.test(url.pathname + url.search + url.hash);
  } catch {
    return false;
  }
}

export function isLikelyTextGraphicCandidate(candidate: Pick<HeroImageCandidate, "url" | "context" | "source">) {
  const haystack = `${candidate.url} ${candidate.context || ""}`.toLowerCase();
  if (candidate.source === "video-poster") {
    return NON_PHOTO_PATTERN.test(haystack.replace(/video[-_ ]?poster/g, ""));
  }
  return NON_PHOTO_PATTERN.test(haystack);
}

export function rankHeroCandidates(candidates: HeroImageCandidate[]) {
  return unique(candidates, (candidate) => candidate.url)
    .filter((candidate) => Boolean(candidate.url) && !isLikelyTextGraphicCandidate(candidate))
    .map((candidate) => {
      const context = `${candidate.url} ${candidate.context || ""}`;
      const declaredBonus = candidate.declaredWidth && candidate.declaredHeight
        ? Math.min(18, Math.round((candidate.declaredWidth * candidate.declaredHeight) / 250_000))
        : 0;
      const photoBonus = PHOTO_POSITIVE_PATTERN.test(context) ? 18 : 0;
      return { ...candidate, score: candidate.score + declaredBonus + photoBonus };
    })
    .sort((a, b) => b.score - a.score);
}

export function extractHeroAssetsFromHtml(html: string, pageUrl: string): ExtractedHeroAssets {
  const images: HeroImageCandidate[] = [];
  const videos: HeroVideoCandidate[] = [];

  const ogImage = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i)?.[1];
  const ogUrl = absoluteUrl(ogImage, pageUrl);
  if (ogUrl) images.push({ url: ogUrl, source: "og-image", context: "open graph social preview", score: 96 });

  for (const match of html.matchAll(/<video\b([^>]*)>([\s\S]*?)<\/video>/gi)) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const posterUrl = absoluteUrl(attribute(attrs, "poster"), pageUrl);
    const sourceValue = attribute(attrs, "src")
      || inner.match(/<source[^>]+src=["']([^"']+)["'][^>]*>/i)?.[1]
      || "";
    const videoUrl = absoluteUrl(sourceValue, pageUrl);
    if (videoUrl && isDirectHeroVideoUrl(videoUrl)) {
      videos.push({ url: videoUrl, posterUrl: posterUrl || undefined, kind: "direct", provider: "html5" });
      if (posterUrl) {
        images.push({
          url: posterUrl,
          source: "video-poster",
          context: `${attribute(attrs, "class")} ${attribute(attrs, "id")} video poster`,
          relatedVideoUrl: videoUrl,
          videoKind: "direct",
          score: 112,
        });
      }
    }
  }

  for (const match of html.matchAll(/<iframe\b([^>]*)>/gi)) {
    const src = absoluteUrl(attribute(match[1] || "", "src"), pageUrl);
    if (!src) continue;
    const youtubeId = youtubeVideoId(src);
    if (youtubeId) {
      const thumbnail = `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`;
      videos.push({ url: src, posterUrl: thumbnail, kind: "link", provider: "youtube" });
      images.push({
        url: thumbnail,
        source: "video-poster",
        context: "youtube video thumbnail",
        relatedVideoUrl: src,
        videoKind: "link",
        score: 105,
      });
    } else if (/player\.vimeo\.com|vimeo\.com/i.test(src)) {
      videos.push({ url: src, kind: "link", provider: "vimeo" });
    }
  }

  let imageIndex = 0;
  for (const match of html.matchAll(/<img\b([^>]*)>/gi)) {
    const attrs = match[1] || "";
    const srcset = attribute(attrs, "srcset") || attribute(attrs, "data-srcset");
    const rawUrl = largestSrcsetUrl(srcset)
      || attribute(attrs, "src")
      || attribute(attrs, "data-src")
      || attribute(attrs, "data-lazy-src");
    const url = absoluteUrl(rawUrl, pageUrl);
    if (!url) continue;
    const context = [attribute(attrs, "alt"), attribute(attrs, "class"), attribute(attrs, "id"), attribute(attrs, "title")]
      .filter(Boolean)
      .join(" ");
    const isHero = PHOTO_POSITIVE_PATTERN.test(context);
    images.push({
      url,
      source: isHero ? "hero-image" : "page-image",
      context,
      declaredWidth: numericAttribute(attrs, "width"),
      declaredHeight: numericAttribute(attrs, "height"),
      score: isHero ? 92 : Math.max(42, 76 - imageIndex * 3),
    });
    imageIndex += 1;
    if (imageIndex >= 50) break;
  }

  return { images: rankHeroCandidates(images), videos: unique(videos, (video) => video.url) };
}

function parsePngDimensions(buf: Buffer) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseJpegDimensions(buf: Buffer) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function parseWebpDimensions(buf: Buffer) {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8X") {
    return {
      width: 1 + ((buf[26] << 16) | (buf[25] << 8) | buf[24]),
      height: 1 + ((buf[29] << 16) | (buf[28] << 8) | buf[27]),
    };
  }
  if (format === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

function parseImageDimensions(buf: Buffer) {
  return parsePngDimensions(buf) || parseJpegDimensions(buf) || parseWebpDimensions(buf);
}

type ProbedImage = {
  candidate: HeroImageCandidate;
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
};

async function probeHeroCandidate(candidate: HeroImageCandidate): Promise<ProbedImage | null> {
  try {
    const response = await fetch(candidate.url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(HERO_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatGeniusDemoSitesHero/2.0)" },
    });
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(mimeType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < HERO_MIN_BYTES || buffer.length > HERO_MAX_BYTES) return null;
    const dimensions = parseImageDimensions(buffer);
    if (!dimensions) return null;
    const aspect = dimensions.width / dimensions.height;
    if (dimensions.width < HERO_MIN_WIDTH || dimensions.height < HERO_MIN_HEIGHT) return null;
    if (aspect < HERO_MIN_ASPECT || aspect > HERO_MAX_ASPECT) return null;
    return { candidate, buffer, mimeType, ...dimensions };
  } catch {
    return null;
  }
}

async function aiAcceptsHeroImage(image: ProbedImage) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return true;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: "Assess this candidate for a professional business website hero. Reject screenshots, documents, flyers, certificates, logos, infographics, collages dominated by text, blurry images and low-quality graphics. A small natural sign or product label is acceptable, but the image must primarily be a strong real photograph or polished photorealistic scene. Return only JSON: {\"usable\":true|false,\"text_dominant\":true|false,\"reason\":\"short\"}.",
              },
              { inlineData: { mimeType: image.mimeType, data: image.buffer.toString("base64") } },
            ],
          }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      },
    );
    if (!response.ok) return true;
    const payload = await response.json();
    const raw = text(payload?.candidates?.[0]?.content?.parts?.find((part: any) => part.text)?.text)
      .replace(/```json|```/gi, "");
    const parsed = JSON.parse(raw || "{}");
    return parsed.usable === true && parsed.text_dominant !== true;
  } catch {
    return true;
  }
}

async function selectHeroCandidate(candidates: HeroImageCandidate[]) {
  const ranked = rankHeroCandidates(candidates).slice(0, HERO_CANDIDATE_LIMIT);
  const probed = (await Promise.all(ranked.map(probeHeroCandidate))).filter((item): item is ProbedImage => Boolean(item));
  probed.sort((a, b) => b.candidate.score - a.candidate.score || b.width * b.height - a.width * a.height);
  for (const image of probed.slice(0, 4)) {
    if (await aiAcceptsHeroImage(image)) return image;
  }
  return null;
}

function industryHeroPrompt(templateSlug: string, industry?: string | null) {
  const key = `${templateSlug} ${industry || ""}`.toLowerCase();
  if (/tak|fasade|byggeprodukt/.test(key)) return "a premium Scandinavian roof and facade project, architectural detail, skilled professionals, modern house exterior";
  if (/tannlege|klinikk/.test(key)) return "a bright modern Scandinavian dental clinic, calm premium interior, welcoming professional atmosphere";
  if (/terapeut|psykolog/.test(key)) return "a calm elegant therapy office with natural light, comfortable chairs, warm Scandinavian interior";
  if (/bilverksted|dekk|auto/.test(key)) return "a clean modern car workshop with a skilled mechanic, premium professional lighting";
  if (/handverk|bygg|elektro|rorlegger|snekker/.test(key)) return "a skilled Scandinavian craftsman working on a modern residential project, authentic tools and daylight";
  if (/radgiver|konsulent|regnskap|advokat/.test(key)) return "a premium Scandinavian consulting office, confident professional meeting, natural light and trust";
  if (/transport|logistikk|frakt/.test(key)) return "a clean professional logistics operation with modern delivery vehicle and organized warehouse, Scandinavian setting";
  return "a premium Scandinavian local business in an authentic professional work setting, natural light, trustworthy people";
}

async function generateAiHero(
  supabase: SupabaseLike,
  input: { orderId: string; companyName: string; templateSlug: string; industry?: string | null; brandColor: string },
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";
  const prompt = `Create a wide cinematic 16:9 hero photograph for ${input.companyName}, a ${input.industry || input.templateSlug} business. Scene: ${industryHeroPrompt(input.templateSlug, input.industry)}. High-end commercial photography, realistic, natural composition, clear visual focus, enough negative space for website headline overlay, subtle accents inspired by ${input.brandColor}. No text, letters, words, logos, watermarks, signs, posters, certificates, screenshots or infographics.`;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(50_000),
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 1 },
        }),
      },
    );
    if (!response.ok) return "";
    const payload = await response.json();
    const part = payload?.candidates?.[0]?.content?.parts?.find((item: any) => item.inlineData?.data);
    if (!part?.inlineData?.data) return "";
    const mimeType = part.inlineData.mimeType || "image/png";
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.includes("webp") ? "webp" : "png";
    const path = `demosites/${input.orderId}/hero-ai-${Date.now()}.${extension}`;
    const buffer = Buffer.from(part.inlineData.data, "base64");
    const upload = await supabase.storage.from("content-images").upload(path, buffer, { contentType: mimeType, upsert: true });
    if (upload.error) return "";
    return supabase.storage.from("content-images").getPublicUrl(path).data?.publicUrl || "";
  } catch {
    return "";
  }
}

async function loadWebsiteHeroAssets(websiteUrl?: string | null) {
  const raw = text(websiteUrl);
  if (!raw) return { images: [], videos: [] } as ExtractedHeroAssets;
  try {
    const safeUrl = String(await validatePublicWebsiteUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`));
    const response = await fetch(safeUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(HERO_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ChatGeniusDemoSitesHero/2.0)" },
    });
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) return { images: [], videos: [] };
    const html = (await response.text()).slice(0, HERO_MAX_HTML_BYTES);
    return extractHeroAssetsFromHtml(html, safeUrl);
  } catch {
    return { images: [], videos: [] };
  }
}

function cleanGallery(values: string[], logoUrl: string) {
  const normalizedLogo = logoUrl.toLowerCase().split(/[?#]/)[0];
  return unique(values, (value) => value)
    .filter((value) => {
      const normalized = value.toLowerCase().split(/[?#]/)[0];
      if (!normalized || normalized === normalizedLogo) return false;
      return !NON_PHOTO_PATTERN.test(normalized);
    })
    .slice(0, 6);
}

export async function enrichDemoSiteOrderWithHeroAssets(
  supabase: SupabaseLike,
  order: DemoOrderForEnrichment,
  options: DemoSiteEnrichmentOptions = {},
): Promise<DemoSiteEnrichmentResult & { heroAsset: SelectedHeroAsset | null }> {
  const baseResult = await enrichDemoSiteOrder(supabase, order, options);
  const current = await supabase
    .from("demo_site_orders")
    .select("editable_fields, logo_url, brand_color")
    .eq("id", order.id)
    .maybeSingle();
  const fields: Record<string, unknown> = { ...(current.data?.editable_fields || order.editable_fields || {}) };
  const logoUrl = text(fields.logo_url || current.data?.logo_url);
  const templateSlug = text(fields.template_slug || order.template_slug) || "local-service";
  const brandColor = text(fields.brand_color || current.data?.brand_color || order.brand_color) || "#2563eb";
  const existingGallery = options.regenerateImages ? [] : cleanGallery(list(fields.gallery_images), logoUrl);
  const websiteAssets = options.imagesOnly && !order.website_url
    ? ({ images: [], videos: [] } as ExtractedHeroAssets)
    : await loadWebsiteHeroAssets(order.website_url);
  const galleryCandidates: HeroImageCandidate[] = existingGallery.map((url, index) => ({
    url,
    source: "existing-gallery",
    context: "existing gallery image",
    score: Math.max(55, 82 - index * 4),
  }));
  const selected = await selectHeroCandidate([...websiteAssets.images, ...galleryCandidates]);

  let heroAsset: SelectedHeroAsset | null = null;
  if (selected) {
    const relatedVideo = selected.candidate.relatedVideoUrl;
    heroAsset = {
      imageUrl: selected.candidate.url,
      source: relatedVideo ? "video" : selected.candidate.source === "existing-gallery" ? "gallery" : "website",
      videoUrl: relatedVideo,
      videoKind: selected.candidate.videoKind,
      width: selected.width,
      height: selected.height,
    };
  }

  if (!heroAsset && options.generateImages !== false) {
    const aiHero = await generateAiHero(supabase, {
      orderId: order.id,
      companyName: order.company_name,
      templateSlug,
      industry: order.industry,
      brandColor,
    });
    if (aiHero) heroAsset = { imageUrl: aiHero, source: "ai" };
  }

  if (heroAsset) {
    fields.hero_image_url = heroAsset.imageUrl;
    fields.hero_asset_source = heroAsset.source;
    fields.hero_asset_checked_at = new Date().toISOString();
    if (heroAsset.videoUrl) {
      fields.hero_video_url = heroAsset.videoUrl;
      fields.hero_video_poster_url = heroAsset.imageUrl;
      fields.hero_video_kind = heroAsset.videoKind || "link";
    } else {
      delete fields.hero_video_url;
      delete fields.hero_video_poster_url;
      delete fields.hero_video_kind;
    }
    const rest = cleanGallery(existingGallery.filter((url) => url !== heroAsset?.imageUrl), logoUrl);
    fields.gallery_images = [heroAsset.imageUrl, ...rest].slice(0, 6);
  }

  const enrichment = fields.enrichment && typeof fields.enrichment === "object" && !Array.isArray(fields.enrichment)
    ? fields.enrichment as Record<string, unknown>
    : {};
  fields.enrichment = {
    ...enrichment,
    hero_asset: heroAsset,
    hero_candidates_found: websiteAssets.images.length,
    video_candidates_found: websiteAssets.videos.length,
  };

  const update = await supabase.from("demo_site_orders").update({ editable_fields: fields }).eq("id", order.id);
  if (update.error) baseResult.errors.push(`hero_persist_failed: ${update.error.message}`);

  try {
    await supabase.from("demo_site_order_events").insert({
      order_id: order.id,
      event_type: "hero_asset_selected",
      title: heroAsset?.source === "ai" ? "AI-hero valgt" : heroAsset?.source === "video" ? "Videoposter valgt som hero" : "Hero-bilde kvalitetssikret",
      description: heroAsset
        ? `${heroAsset.source} · ${heroAsset.width || "?"}x${heroAsset.height || "?"}${heroAsset.videoUrl ? " · video tilgjengelig" : ""}`
        : "Ingen kandidat bestod kvalitetskravene, og AI-generering var ikke tilgjengelig.",
      metadata: { hero_asset: heroAsset, candidates: websiteAssets.images.length, videos: websiteAssets.videos.length },
    });
  } catch {
    // Best effort only.
  }

  return { ...baseResult, heroAsset };
}
