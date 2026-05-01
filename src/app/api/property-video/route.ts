import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { renderVideo, cleanupRender, ensureFFmpeg, type TextSlide } from "@/services/integrations/ffmpeg-renderer";
import { uploadVideo, setThumbnail } from "@/services/integrations/youtube-client";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Brand contact emails — used in YouTube descriptions and CTA */
const BRAND_EMAILS: Record<string, string> = {
  zeneco: "freddy@zenecohomes.com",
  soleada: "freddy@soleada.no",
  chatgenius: "freddy@chatgenius.pro",
  freddyb: "post@freddybremseth.com",
  pinosoecolife: "freddy@pinosoecolife.com",
  donaanna: "freddy@zenecohomes.com",
  neuralbeat: "freddy@chatgenius.pro",
  remasterfreddy: "freddy@chatgenius.pro",
};

/** Royalty-free background music URLs for property videos */
const MUSIC_URLS = [
  // Calm ambient tracks from Pixabay (royalty-free, no attribution needed)
  "https://cdn.pixabay.com/audio/2024/11/29/audio_a0fdd0f7db.mp3", // "Peaceful Ambient"
  "https://cdn.pixabay.com/audio/2023/10/30/audio_961efa6fc4.mp3", // "Inspirational Background"
  "https://cdn.pixabay.com/audio/2024/02/14/audio_8e153fe920.mp3", // "Soft Corporate"
];

export const maxDuration = 300; // 5 min for video rendering

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function formatVideoPrice(value: unknown): string {
  const price = Number(value || 0);
  if (!price) return "Pris pa foresporsel";
  return `EUR ${price.toLocaleString("no-NO")}`;
}

function formatVideoArea(property: Record<string, unknown>): string {
  const area = Number(property?.built_area || property?.area || property?.size || 0);
  return area > 0 ? `${area.toLocaleString("no-NO")} m2` : "";
}

function cleanVideoLabel(value: unknown, fallback = ""): string {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function fitVideoText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

/** Build a calm, persistent property detail strip for the whole video. */
function buildPropertyTextSlides(property: Record<string, unknown>, brand: { name?: string; website?: string }): TextSlide[] {
  const brandName = brand?.name || "Real Estate";
  const location = cleanVideoLabel(property?.town || property?.location, "Spania");
  const type = cleanVideoLabel(property?.property_type || property?.type, "Bolig");
  const price = formatVideoPrice(property?.price);
  const area = formatVideoArea(property);
  const bedrooms = Number(property?.bedrooms || 0) > 0 ? `${property.bedrooms} soverom` : "";
  const bathrooms = Number(property?.bathrooms || 0) > 0 ? `${property.bathrooms} bad` : "";

  const detailParts = [type, price, area, bedrooms, bathrooms].filter(Boolean);
  const detailsText = fitVideoText(detailParts.join("  |  "), 76);

  return [
    {
      overlayStyle: "property-details",
      detailsKicker: fitVideoText(`${location}  ·  ${brandName}`, 62),
      detailsText,
    },
  ];
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(destPath, buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a brand logo to a local file path that ffmpeg can read. Lookup
 * order:
 *   1. Caller-supplied URL (brandLogoUrl in request body) — downloaded
 *   2. /public/brand-logos/<brandId>.png — copied straight from the bundle
 *   3. null (renderer skips the overlay)
 *
 * Local file lookup happens at render time so dropping a new logo into
 * /public/brand-logos doesn't require any code changes.
 */
async function resolveBrandLogo(
  brandId: string | undefined,
  brandLogoUrl: string | undefined,
  destDir: string,
): Promise<string | undefined> {
  // Caller override takes precedence
  if (brandLogoUrl) {
    const dest = path.join(destDir, "logo.png");
    if (await downloadImage(brandLogoUrl, dest)) return dest;
  }

  // Fall back to a logo file shipped in /public/brand-logos
  if (brandId) {
    const candidates = [
      path.join(process.cwd(), "public", "brand-logos", `${brandId}.png`),
      path.join(process.cwd(), "public", "brand-logos", `${brandId}.jpg`),
    ];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        const ext = path.extname(candidate);
        const dest = path.join(destDir, `logo${ext}`);
        await fs.copyFile(candidate, dest);
        console.log(`[Property Video] Using local brand logo: ${candidate}`);
        return dest;
      } catch {
        // not found, try next
      }
    }
  }

  return undefined;
}

/**
 * POST /api/property-video
 *
 * action: "generate_seo" - Generate YouTube SEO title, description, tags for a property
 * action: "generate_description" - Generate engaging video description with CTA
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "generate_seo") {
      const { property, brand, language = "en" } = body;

      if (!property) {
        return NextResponse.json({ error: "Property data required" }, { status: 400 });
      }

      const client = getAnthropicClient();
      if (!client) {
        console.log("[Property Video API] No Anthropic key, using fallback SEO");
        // Fallback without AI
        const title = `${property.property_type || property.type || "Property"} for Sale in ${property.location || "Spain"} - ${property.bedrooms || 0} Bed, €${Number(property.price || 0).toLocaleString()}`;
        const result = {
          title,
          description: `Beautiful ${property.property_type || property.type || "property"} in ${property.location}. ${property.bedrooms} bedrooms, ${property.bathrooms} bathrooms, ${property.built_area || property.area}m². Price: €${Number(property.price || 0).toLocaleString()}`,
          tags: ["property", "spain", "real estate", property.location || "", property.property_type || property.type || ""].filter(Boolean),
        };
        console.log("[Property Video API] Fallback result:", JSON.stringify(result));
        return NextResponse.json(result);
      }

      const langMap: Record<string, string> = {
        en: "English",
        no: "Norwegian",
        es: "Spanish",
        de: "German",
      };

      const brandEmail = BRAND_EMAILS[body.brandId || "zeneco"] || "freddy@zenecohomes.com";
      const prompt = `Generate YouTube SEO-optimized content for a real estate property video.

Property details:
- Type: ${property.type || property.property_type || "Property"}
- Location: ${property.location || property.town || "Spain"}
- Town: ${property.town || ""}
- Price: €${Number(property.price || 0).toLocaleString()}
- Bedrooms: ${property.bedrooms || 0}
- Bathrooms: ${property.bathrooms || 0}
- Built area: ${property.area || property.built_area || 0}m²
- Plot size: ${property.plotArea || property.plot_size || 0}m²
- Pool: ${property.pool ? "Yes" : "No"}
- Garage: ${property.garage ? "Yes" : "No"}
- Year built: ${property.yearBuilt || property.year_built || "N/A"}
- Energy rating: ${property.energyRating || property.energy_rating || "N/A"}
- Reference: ${property.ref || ""}

Brand: ${brand?.name || "Real Estate Agency"}
Website: ${brand?.website || ""}
Contact Email: ${brandEmail}

Language: ${langMap[language] || "English"}

Generate:
1. title: A compelling YouTube title (max 70 chars). Use price, location, key features. Include emoji. Make it click-worthy but not clickbait.
2. description: Full YouTube description (300-500 words) with:
   - Engaging intro paragraph
   - Property details in readable format
   - Location highlights
   - CTA with EXACT email: ${brandEmail} and website: ${brand?.website || ""}
   - "Like & Subscribe" call to action
   - Relevant hashtags at the bottom
   IMPORTANT: Use ONLY this contact email: ${brandEmail} — do NOT use inquiry@ or info@ or any other email.
3. tags: Array of 15-20 relevant YouTube SEO tags

Return JSON only: {"title": "...", "description": "...", "tags": ["..."]}`;

      try {
        const res = await client.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        });

        const text = res.content.find((c) => c.type === "text")?.text || "";
        console.log("[Property Video API] AI response text:", text.substring(0, 200));
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return NextResponse.json(parsed);
          } catch (parseErr) {
            console.error("[Property Video API] JSON parse error:", parseErr);
          }
        }
        console.error("[Property Video API] Failed to parse AI response, raw:", text);
      } catch (aiErr) {
        console.error("[Property Video API] Anthropic API error, using fallback:", aiErr instanceof Error ? aiErr.message : aiErr);
      }

      // Fallback: generate template-based SEO (used when AI fails or key is invalid)
      const fallbackTitle = `${property.property_type || property.type || "Property"} for Sale in ${property.location || property.town || "Spain"} | ${property.bedrooms || 0} Bed, €${Number(property.price || 0).toLocaleString()}`;
      const loc = property.location || property.town || "Spain";
      const fallbackDesc = `${property.property_type || property.type || "Property"} for sale in ${loc}. ${property.bedrooms || 0} bedrooms, ${property.bathrooms || 0} bathrooms, ${property.area || property.built_area || 0}m² built area. Price: €${Number(property.price || 0).toLocaleString()}. ${property.pool ? "Private pool. " : ""}${property.garage ? "Garage. " : ""}${brand?.name ? `Contact ${brand.name}` : ""}${brand?.website ? ` - ${brand.website}` : ""}`;
      return NextResponse.json({
        title: fallbackTitle.substring(0, 70),
        description: fallbackDesc,
        tags: ["property", "real estate", "spain", loc, property.property_type || property.type || "", brand?.name || ""].filter(Boolean),
      });
    }

    if (action === "render_and_upload") {
      const { imageUrls, title, description, tags, brandLogoUrl, privacyStatus = "public", property, brand, brandId } = body;

      if (!imageUrls || imageUrls.length === 0) {
        return NextResponse.json({ error: "imageUrls required" }, { status: 400 });
      }
      if (!title) {
        return NextResponse.json({ error: "title required" }, { status: 400 });
      }

      // SSE streaming for progress updates
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: Record<string, unknown>) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            } catch {}
          };

          const heartbeat = setInterval(() => {
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`)); } catch { clearInterval(heartbeat); }
          }, 10000);

          try {
            // Step 1: Download images
            send({ step: 1, total: 5, message: "Laster ned bilder..." });
            const imgDir = await fs.mkdtemp(path.join(os.tmpdir(), "prop-video-"));
            const imagePaths: string[] = [];

            for (let i = 0; i < imageUrls.length; i++) {
              const imgPath = path.join(imgDir, `img-${i}.jpg`);
              const ok = await downloadImage(imageUrls[i], imgPath);
              if (ok) imagePaths.push(imgPath);
            }

            if (imagePaths.length === 0) {
              send({ step: 1, error: "Ingen bilder kunne lastes ned" });
              clearInterval(heartbeat);
              controller.close();
              return;
            }

            send({ step: 1, total: 5, message: `${imagePaths.length} bilder lastet ned` });

            // Step 2: Resolve brand logo (caller URL → /public/brand-logos/<brandId>.png → none)
            send({ step: 2, total: 5, message: "Klargjør brand-logo..." });
            const logoPath = await resolveBrandLogo(brandId, brandLogoUrl, imgDir);
            if (logoPath) {
              send({ step: 2, total: 5, message: "Brand-logo klar." });
            } else {
              send({ step: 2, total: 5, message: "Ingen brand-logo funnet — fortsetter uten." });
            }

            // Step 3: Download background music (or generate silent fallback)
            send({ step: 3, total: 5, message: "Klargjør FFmpeg..." });
            const audioPath = path.join(imgDir, "music.mp3");
            const totalDuration = imagePaths.length * 5;

            // Use ensureFFmpeg() - same approach as Neural Beat (handles Vercel serverless)
            const ffmpegBin = await ensureFFmpeg();

            // Try to download royalty-free background music
            let musicDownloaded = false;
            send({ step: 3, total: 5, message: "Laster ned bakgrunnsmusikk..." });
            for (const musicUrl of MUSIC_URLS) {
              try {
                const musicRes = await fetch(musicUrl, { redirect: "follow" });
                if (musicRes.ok) {
                  const musicBuf = Buffer.from(await musicRes.arrayBuffer());
                  if (musicBuf.length > 10000) { // Minimum 10KB to be valid
                    await fs.writeFile(audioPath, musicBuf);
                    console.log(`[Property Video] Music downloaded: ${(musicBuf.length / 1024 / 1024).toFixed(1)} MB from ${musicUrl.substring(0, 60)}`);
                    musicDownloaded = true;
                    send({ step: 3, total: 5, message: `Bakgrunnsmusikk lastet ned (${(musicBuf.length / 1024 / 1024).toFixed(1)} MB)` });
                    break;
                  }
                }
              } catch (musicErr) {
                console.warn(`[Property Video] Music download failed:`, musicErr instanceof Error ? musicErr.message : musicErr);
              }
            }

            // Fallback to silent audio if music download fails
            if (!musicDownloaded) {
              send({ step: 3, total: 5, message: "Genererer stille lydspor (musikk utilgjengelig)..." });
              try {
                await execFileAsync(ffmpegBin, [
                  "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                  "-t", String(totalDuration), "-q:a", "9", "-y", audioPath,
                ], { timeout: 30000 });
              } catch {
                send({ step: 3, total: 5, message: "Lydspor hoppet over" });
              }
            }

            // Step 4: Render video
            send({ step: 4, total: 5, message: "Rendrer video med FFmpeg..." });

            // Build text slides from property data (cycling price/size/location/CTA overlays)
            const textSlides: TextSlide[] | undefined = property
              ? buildPropertyTextSlides(property as Record<string, unknown>, brand || {})
              : undefined;

            const renderResult = await renderVideo({
              audioUrl: audioPath.startsWith("/") ? `file://${audioPath}` : audioPath,
              imagePaths,
              logoPath,
              textSlides,
              duration: totalDuration,
              // Property videos use text-heavy slides (price/rooms/sqm) and a
              // brand logo overlay — Ken Burns zoom/pan blurs the text and
              // makes the logo wander, so we render still frames here. Music
              // videos still get Ken Burns by default (see neural-beat).
              kenBurns: false,
              onSegmentProgress: (current, total) => {
                send({ step: 4, total: 5, message: `Rendrer bilde ${current}/${total}` });
              },
            });

            send({ step: 4, total: 5, message: `Video rendret: ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB` });

            // Step 5: Upload to YouTube (uses brand-specific channel if configured)
            send({ step: 5, total: 5, message: `Laster opp til YouTube${brandId ? ` (brand: ${brandId})` : " (standard kanal)"}...` });
            console.log(`[Property Video] Uploading ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB to YouTube, brandId=${brandId || 'default'}`);

            let uploadResult;
            try {
              uploadResult = await uploadVideo(renderResult.videoBuffer, {
                title,
                description: description || "",
                tags: tags || [],
                categoryId: "22",
                privacyStatus: privacyStatus as "public" | "private" | "unlisted",
              }, brandId || undefined);
              console.log(`[Property Video] Upload success: ${uploadResult.videoId}`);
            } catch (uploadErr) {
              const uploadMsg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
              console.error(`[Property Video] YouTube upload FAILED:`, uploadMsg);
              send({ step: 5, total: 5, error: `YouTube-opplasting feilet: ${uploadMsg}` });
              clearInterval(heartbeat);
              controller.close();
              return;
            }

            // Try to set thumbnail from first image
            try {
              const thumbBuffer = await fs.readFile(imagePaths[0]);
              await setThumbnail(uploadResult.videoId, thumbBuffer);
              console.log(`[Property Video] Thumbnail set for ${uploadResult.videoId}`);
            } catch (thumbErr) {
              console.warn(`[Property Video] Thumbnail failed (non-critical):`, thumbErr instanceof Error ? thumbErr.message : thumbErr);
            }

            send({
              step: 5,
              total: 5,
              message: "Ferdig!",
              completed: true,
              videoId: uploadResult.videoId,
              youtubeUrl: uploadResult.youtubeUrl,
            });

            // Cleanup
            clearInterval(heartbeat);
            try { await cleanupRender(renderResult.videoPath); } catch {}
            try { await fs.rm(imgDir, { recursive: true }); } catch {}
            controller.close();
          } catch (error) {
            const msg = error instanceof Error ? error.message : "Ukjent feil";
            send({ error: msg });
            clearInterval(heartbeat);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[Property Video API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
