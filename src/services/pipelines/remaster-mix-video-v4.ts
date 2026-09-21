import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";
import { buildRemasterMixGlobalAssOverlay, buildVisualConcatFile } from "./remaster-mix-video-compat";

const execFileAsync = promisify(execFile);
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 6;
const DEFAULT_REMASTER_LOGO_URL = "https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/1780843951381-logo-Gemini_Generated_Image_9rr3k69rr3k69rr3__1_.png";
const DEFAULT_ZENECO_LOGO_URL = "https://realtyflow.chatgenius.pro/brand-logos/zeneco.png";

export interface RemasterMixVideoV4Input {
  audioPath: string;
  imageUrls: string[];
  title: string;
  targetMinutes: number;
  sponsorIntervalMinutes: number;
  ctaText?: string | null;
  zenEcoHomesEnabled: boolean;
  promotionBrand?: 'zeneco' | 'art' | 'books' | 'none';
  logoUrl?: string | null;
  zenEcoLogoUrl?: string | null;
  audioDurationSeconds?: number | null;
  onProgress?: (progress: number, step: string) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

export interface RemasterMixVideoV4Result {
  videoPath: string;
  workingDirectory: string;
  durationSeconds: number;
  imageCount: number;
  fileSizeBytes: number;
}

function runFFmpeg(
  binary: string,
  args: string[],
  expectedDurationSeconds: number,
  onRenderProgress?: (renderedSeconds: number) => void | Promise<void>,
  abortSignal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let progressBuffer = "";
    let lastReportedAt = 0;
    let lastRenderedSeconds = 0;
    let settled = false;

    const cleanup = () => {
      clearInterval(heartbeatTimer);
      abortSignal?.removeEventListener("abort", handleAbort);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const handleAbort = () => {
      if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
      fail(abortSignal?.reason instanceof Error ? abortSignal.reason : new Error("Long-form FFmpeg render aborted."));
    };
    const reportProgress = (seconds: number) => {
      const now = Date.now();
      lastRenderedSeconds = Math.max(lastRenderedSeconds, Math.min(expectedDurationSeconds, seconds));
      if (!onRenderProgress || now - lastReportedAt < 30_000) return;
      lastReportedAt = now;
      Promise.resolve(onRenderProgress(lastRenderedSeconds)).catch((error) => {
        console.warn("[RemasterMixVideoV4] progress callback failed:", error instanceof Error ? error.message : error);
      });
    };

    const heartbeatTimer = setInterval(() => {
      if (!onRenderProgress) return;
      Promise.resolve(onRenderProgress(lastRenderedSeconds)).catch((error) => {
        console.warn("[RemasterMixVideoV4] heartbeat callback failed:", error instanceof Error ? error.message : error);
      });
    }, 60_000);

    if (abortSignal?.aborted) {
      handleAbort();
      return;
    }
    abortSignal?.addEventListener("abort", handleAbort, { once: true });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
      progressBuffer += text;
      const lines = progressBuffer.split(/\r?\n/);
      progressBuffer = lines.pop() || "";
      for (const line of lines) {
        const match = line.match(/^out_time_(?:us|ms)=(\d+)$/);
        if (match) reportProgress(Number(match[1]) / 1_000_000);
      }
    });
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) succeed();
      else fail(new Error(`Long-form FFmpeg V4 failed with code ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

async function probeDuration(binary: string, filePath: string) {
  let stderr = "";
  try {
    const result = await execFileAsync(binary, ["-i", filePath, "-hide_banner", "-f", "null", "-"]);
    stderr = result.stderr || "";
  } catch (error: any) {
    stderr = error?.stderr || "";
  }
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) throw new Error(`Could not determine duration for ${path.basename(filePath)}.`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`);
}

async function downloadImage(url: string, destination: string) {
  if (url.startsWith("/") || url.startsWith("file://")) {
    await fs.copyFile(url.replace(/^file:\/\//, ""), destination);
    return;
  }
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Image download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body as any), fsSync.createWriteStream(destination));
}

async function downloadVisuals(urls: string[], workingDirectory: string, binary: string, normalizeFormat: boolean) {
  const imagePaths: string[] = [];
  const converted = new Map<string, string>();
  for (let index = 0; index < urls.length; index += 1) {
    // Reused book covers must not cause redundant 24x network requests.
    const prior = converted.get(urls[index]);
    if (prior) { imagePaths.push(prior); continue; }
    const label = String(index).padStart(3, "0");
    const target = path.join(workingDirectory, `visual-${label}.jpg`);
    const source = normalizeFormat ? path.join(workingDirectory, `visual-${label}.source`) : target;
    try {
      await downloadImage(urls[index], source);
      const stat = await fs.stat(source);
      if (stat.size <= 1024) throw new Error("Image unexpectedly small");
      if (normalizeFormat) {
        // The concat demuxer requires consistent codecs. Art is WebP and
        // books mix JPEG/PNG; never feed these bytes disguised as .jpg.
        await new Promise<void>((resolve,reject) => {
          const child=spawn(binary,["-hide_banner","-loglevel","error","-i",source,
            "-frames:v","1","-q:v","3","-y",target],{stdio:["ignore","ignore","pipe"]});
          let stderr="";
          child.stderr.on("data",chunk=>{stderr+=chunk.toString();});
          child.once("error",reject);
          child.once("close",code=>code===0?resolve():reject(new Error(stderr.slice(-500))));
        });
        await fs.unlink(source).catch(()=>undefined);
      }
      imagePaths.push(target);
      converted.set(urls[index],target);
    } catch (error) {
      console.warn(`[RemasterMixVideoV4] Visual ${index + 1} skipped:`, error instanceof Error ? error.message : error);
      await Promise.all([fs.unlink(target).catch(()=>undefined),fs.unlink(source).catch(()=>undefined)]);
    }
  }
  return imagePaths;
}

async function downloadLogo(url: string | null | undefined, workingDirectory: string, filename: string, binary: string) {
  if (!url) return null;
  const target = path.join(workingDirectory, filename);
  try {
    await downloadImage(url, target);
    const stat = await fs.stat(target);
    if (stat.size <= 1024) throw new Error("Logo file is unexpectedly small.");
    // File size / extension are not proof of a decodable PNG. Use the very
    // same FFmpeg binary deployed in production and fail open for optional
    // branding before entering the expensive 30-minute encoder process.
    await execFileAsync(binary, [
      "-hide_banner", "-v", "error", "-xerror", "-i", target,
      "-frames:v", "1", "-f", "null", "-"
    ], { timeout: 20_000, maxBuffer: 128 * 1024 });
    return target;
  } catch (error) {
    console.warn(`[RemasterMixVideoV4] ${filename} skipped:`, error instanceof Error ? error.message : error);
    await fs.unlink(target).catch(() => undefined);
    return null;
  }
}

function escapeAssFilterPath(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildSponsorEnableExpressionV4(durationSeconds: number, sponsorIntervalMinutes: number) {
  const duration = Math.max(1, durationSeconds);
  const interval = Math.max(5, sponsorIntervalMinutes || 10) * 60;
  const windows: string[] = [];
  for (let start = interval; start < duration; start += interval) {
    const end = Math.min(duration, start + 10);
    windows.push(`between(t,${start.toFixed(3)},${end.toFixed(3)})`);
  }
  return windows.length ? windows.join("+") : "0";
}

export function buildConcatVisualFilterV4(
  assPath: string | null,
  logoInputIndex: number | null = null,
  zenEcoLogoInputIndex: number | null = null,
  sponsorIntervalMinutes = 10,
  durationSeconds = 30 * 60,
  visualFit: 'cover' | 'contain' = 'cover',
  frameRate = FPS,
) {
  const parts = [
    visualFit === 'contain'
      ? `[0:v]fps=${frameRate},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=0x101820,setsar=1[slideshow]`
      : `[0:v]fps=${frameRate},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},setsar=1[slideshow]`,
  ];
  if (assPath) parts.push(`[slideshow]ass=filename='${escapeAssFilterPath(assPath)}'[texted]`);
  else parts.push("[slideshow]null[texted]");

  let current = "texted";
  if (logoInputIndex !== null) {
    parts.push(`[${logoInputIndex}:v]scale=240:-1:force_original_aspect_ratio=decrease[remaster_logo]`);
    parts.push(`[${current}][remaster_logo]overlay=x=W-w-38:y=28:eof_action=repeat:shortest=0[with_remaster_logo]`);
    current = "with_remaster_logo";
  }

  if (zenEcoLogoInputIndex !== null) {
    const enable = buildSponsorEnableExpressionV4(durationSeconds, sponsorIntervalMinutes);
    parts.push(`[${zenEcoLogoInputIndex}:v]split=2[zen_persistent_src][zen_sponsor_src]`);
    parts.push("[zen_persistent_src]scale=280:-1:force_original_aspect_ratio=decrease[zen_persistent]");
    parts.push("[zen_sponsor_src]scale=700:-1:force_original_aspect_ratio=decrease[zen_sponsor]");
    parts.push(`[${current}][zen_persistent]overlay=x=38:y=28:eof_action=repeat:shortest=0[with_zen_logo]`);
    parts.push(`[with_zen_logo][zen_sponsor]overlay=x=(W-w)/2:y=180:enable='${enable}':eof_action=repeat:shortest=0[with_sponsor_logo]`);
    current = "with_sponsor_logo";
  }

  parts.push(`[${current}]format=yuv420p[vout]`);
  return parts.join(";");
}

export async function renderRemasterLongFormMixV4(input: RemasterMixVideoV4Input): Promise<RemasterMixVideoV4Result> {
  if (input.imageUrls.length < 12) throw new Error("At least 12 visual URLs are required for a long-form mix.");

  const binary = await ensureFFmpeg();
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-mix-video-v4-"));

  try {
    await input.onProgress?.(1, "downloading_visuals_v4");
    const artOrBooks = input.promotionBrand === 'art' || input.promotionBrand === 'books';
    // Original art and book covers are still frames, not moving footage. Two
    // frames per second preserves 1920×1080 detail while cutting 30-minute
    // FFmpeg work/encoder pressure by ~3× compared with 6 fps realty video.
    const frameRate = artOrBooks ? 2 : FPS;
    const imagePaths = await downloadVisuals(input.imageUrls, workingDirectory, binary, artOrBooks);
    if (imagePaths.length < 12) throw new Error(`Only ${imagePaths.length} visuals downloaded; at least 12 are required.`);

    const expectedDuration = input.audioDurationSeconds && input.audioDurationSeconds > 0
      ? input.audioDurationSeconds
      : await probeDuration(binary, input.audioPath);
    const measuredAudioDuration = await probeDuration(binary, input.audioPath);
    if (Math.abs(measuredAudioDuration - expectedDuration) > 2.5) {
      throw new Error(`Mix audio duration mismatch: measured ${measuredAudioDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s.`);
    }

    const segmentDuration = expectedDuration / imagePaths.length;
    const concatPath = path.join(workingDirectory, "visuals.ffconcat");
    await fs.writeFile(concatPath, buildVisualConcatFile(imagePaths, segmentDuration), "utf8");

    let assPath: string | null = null;
    const sponsorBrand = input.promotionBrand || (input.zenEcoHomesEnabled ? 'zeneco' : 'none');
    if (sponsorBrand !== 'none') {
      assPath = path.join(workingDirectory, "overlay.ass");
      await fs.writeFile(assPath, buildRemasterMixGlobalAssOverlay({
        durationSeconds: expectedDuration,
        sponsorIntervalMinutes: input.sponsorIntervalMinutes,
        ctaText: input.ctaText,
        zenEcoHomesEnabled: sponsorBrand === 'zeneco',
        promotionBrand: sponsorBrand,
      }), "utf8");
    }

    // Historical production regression: a superficially downloadable PNG logo
    // could fail FFmpeg decoding and strand a long-form mix at the 18% entry
    // to rendering. Art and books already have permanent RE-MASTER FREDDY +
    // partner credits in the ASS overlay, so use that verified text-only
    // branding for those still-image mixes, never a second PNG input.
    const logoUrl = input.logoUrl || process.env.REMASTER_MIX_LOGO_URL || DEFAULT_REMASTER_LOGO_URL;
    const logoPath = artOrBooks ? null
      : await downloadLogo(logoUrl, workingDirectory, "remaster-logo.png", binary);
    const zenEcoLogoUrl = input.zenEcoLogoUrl || process.env.REMASTER_MIX_ZENECO_LOGO_URL || DEFAULT_ZENECO_LOGO_URL;
    const zenEcoLogoPath = sponsorBrand === 'zeneco'
      ? await downloadLogo(zenEcoLogoUrl, workingDirectory, "zeneco-logo.png", binary)
      : null;

    const logoInput = logoPath ? ["-framerate", "1", "-i", logoPath] : [];
    const zenEcoLogoInput = zenEcoLogoPath ? ["-framerate", "1", "-i", zenEcoLogoPath] : [];
    const logoInputIndex = logoPath ? 1 : null;
    const zenEcoLogoInputIndex = zenEcoLogoPath ? 1 + (logoPath ? 1 : 0) : null;
    const audioInputIndex = 1 + (logoPath ? 1 : 0) + (zenEcoLogoPath ? 1 : 0);

    const videoPath = path.join(workingDirectory, "remaster-mediterranean-mix-v4.mp4");
    // 18% means only that FFmpeg is about to start, NOT that 18 seconds of
    // video were encoded. Expose a separate startup phase for incident triage.
    await input.onProgress?.(18, "starting_ffmpeg_v4");
    await input.onProgress?.(18, "rendering_visuals_v4");
    await runFFmpeg(binary, [
      "-hide_banner",
      "-progress", "pipe:2",
      "-nostats",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      ...logoInput,
      ...zenEcoLogoInput,
      "-i", input.audioPath,
      "-filter_complex_threads", artOrBooks ? "2" : "4",
      "-filter_complex", buildConcatVisualFilterV4(
        assPath,
        logoInputIndex,
        zenEcoLogoInputIndex,
        input.sponsorIntervalMinutes,
        expectedDuration,
        sponsorBrand === 'art' || sponsorBrand === 'books' ? 'contain' : 'cover',
        frameRate,
      ),
      "-map", "[vout]",
      "-map", `${audioInputIndex}:a:0`,
      "-t", expectedDuration.toFixed(3),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-threads", artOrBooks ? "2" : "4",
      "-crf", "30",
      "-r", String(frameRate),
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-y",
      videoPath,
    ], expectedDuration, async (renderedSeconds) => {
      const ratio = expectedDuration > 0 ? Math.max(0, Math.min(1, renderedSeconds / expectedDuration)) : 0;
      const progress = 18 + Math.floor(ratio * 62);
      await input.onProgress?.(Math.min(80, progress), "rendering_visuals_v4");
    }, input.abortSignal);

    const measuredVideoDuration = await probeDuration(binary, videoPath);
    if (Math.abs(measuredVideoDuration - expectedDuration) > 2.5) {
      throw new Error(`Rendered video duration mismatch: measured ${measuredVideoDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s.`);
    }

    await input.onProgress?.(82, "video_ready_v4");
    for (const imagePath of imagePaths) await fs.unlink(imagePath).catch(() => undefined);
    await fs.unlink(concatPath).catch(() => undefined);
    if (assPath) await fs.unlink(assPath).catch(() => undefined);
    if (logoPath) await fs.unlink(logoPath).catch(() => undefined);
    if (zenEcoLogoPath) await fs.unlink(zenEcoLogoPath).catch(() => undefined);

    const stat = await fs.stat(videoPath);
    await input.onProgress?.(85, "video_verified_v4");
    return {
      videoPath,
      workingDirectory,
      durationSeconds: measuredVideoDuration,
      imageCount: imagePaths.length,
      fileSizeBytes: stat.size,
    };
  } catch (error) {
    await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupRemasterLongFormMixV4(result: Pick<RemasterMixVideoV4Result, "workingDirectory">) {
  if (!result.workingDirectory.includes("remaster-mix-video-v4-")) return;
  await fs.rm(result.workingDirectory, { recursive: true, force: true }).catch(() => undefined);
}
