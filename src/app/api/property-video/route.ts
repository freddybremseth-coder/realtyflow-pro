import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { renderVideo, cleanupRender } from "@/services/integrations/ffmpeg-renderer";
import { uploadVideo, setThumbnail } from "@/services/integrations/youtube-client";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
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

Language: ${langMap[language] || "English"}

Generate:
1. title: A compelling YouTube title (max 70 chars). Use price, location, key features. Include emoji. Make it click-worthy but not clickbait.
2. description: Full YouTube description (300-500 words) with:
   - Engaging intro paragraph
   - Property details in readable format
   - Location highlights
   - CTA: Contact info, website link, "Like & Subscribe"
   - Relevant hashtags at the bottom
3. tags: Array of 15-20 relevant YouTube SEO tags

Return JSON only: {"title": "...", "description": "...", "tags": ["..."]}`;

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
          console.log("[Property Video API] Parsed SEO:", JSON.stringify(parsed).substring(0, 200));
          return NextResponse.json(parsed);
        } catch (parseErr) {
          console.error("[Property Video API] JSON parse error:", parseErr);
        }
      }

      console.error("[Property Video API] Failed to parse AI response, raw:", text);
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    if (action === "render_and_upload") {
      const { imageUrls, title, description, tags, brandLogoUrl, privacyStatus = "private" } = body;

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

            // Step 2: Download logo if provided
            let logoPath: string | undefined;
            if (brandLogoUrl) {
              send({ step: 2, total: 5, message: "Laster ned logo..." });
              const logoTmpPath = path.join(imgDir, "logo.png");
              const logoOk = await downloadImage(brandLogoUrl, logoTmpPath);
              if (logoOk) logoPath = logoTmpPath;
            }

            // Step 3: Generate silent audio track (property videos have no music)
            send({ step: 3, total: 5, message: "Genererer lydspor..." });
            const silentAudioPath = path.join(imgDir, "silent.mp3");
            // Create a 5-second-per-image silent audio using FFmpeg
            const totalDuration = imagePaths.length * 5;

            // We'll use renderVideo with a silent audio — generate one
            const { execSync } = require("child_process");
            try {
              // Try local ffmpeg first
              const ffmpegBin = require("path").join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
              execSync(`"${ffmpegBin}" -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} -q:a 9 -y "${silentAudioPath}"`, { timeout: 30000 });
            } catch {
              try {
                execSync(`ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t ${totalDuration} -q:a 9 -y "${silentAudioPath}"`, { timeout: 30000 });
              } catch {
                // Last resort: create minimal MP3 — use audio file from URL is not possible here
                // Render without audio
                send({ step: 3, total: 5, message: "Lydspor hoppet over" });
              }
            }

            // Step 4: Render video
            send({ step: 4, total: 5, message: "Rendrer video med FFmpeg..." });
            const renderResult = await renderVideo({
              audioUrl: silentAudioPath.startsWith("/") ? `file://${silentAudioPath}` : silentAudioPath,
              imagePaths,
              logoPath,
              duration: totalDuration,
              onSegmentProgress: (current, total) => {
                send({ step: 4, total: 5, message: `Rendrer bilde ${current}/${total}` });
              },
            });

            send({ step: 4, total: 5, message: `Video rendret: ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB` });

            // Step 5: Upload to YouTube
            send({ step: 5, total: 5, message: "Laster opp til YouTube..." });
            const uploadResult = await uploadVideo(renderResult.videoBuffer, {
              title,
              description: description || "",
              tags: tags || [],
              categoryId: "22",
              privacyStatus: privacyStatus as "public" | "private" | "unlisted",
            });

            // Try to set thumbnail from first image
            try {
              const thumbBuffer = await fs.readFile(imagePaths[0]);
              await setThumbnail(uploadResult.videoId, thumbBuffer);
            } catch {}

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
