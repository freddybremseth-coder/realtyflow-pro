import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";
import { buildRemasterMixGlobalAssOverlay } from "./remaster-mix-video-compat";

const execFileAsync = promisify(execFile);
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 6;
const DEFAULT_REMASTER_LOGO_URL = "https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/1780843951381-logo-Gemini_Generated_Image_9rr3k69rr3k69rr3__1_.png";

export interface RemasterMixVideoV3Input {
  audioPath: string;
  imageUrls: string[];
  title: string;
  targetMinutes: number;
  sponsorIntervalMinutes: number;
  ctaText?: string | null;
  zenEcoHomesEnabled: boolean;
  logoUrl?: string | null;
  audioDurationSeconds?: number | null;
  onProgress?: (progress: number, step: string) => void | Promise<void>;
}

export interface RemasterMixVideoV3Result {
  videoPath: string;
  workingDirectory: string;
  durationSeconds: number;
  imageCount: number;
  fileSizeBytes: number;
}

function runFFmpeg(binary: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 24000) stderr = stderr.slice(-24000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Long-form FFmpeg failed with code ${code}: ${stderr.slice(-2200)}`));
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

async function downloadVisuals(urls: string[], workingDirectory: string) {
  const imagePaths: string[] = [];
  for (let index = 0; index < urls.length; index += 1) {
    const target = path.join(workingDirectory, `visual-${String(index).padStart(3, "0")}.jpg`);
    try {
      await downloadImage(urls[index], target);
      const stat = await fs.stat(target);
      if (stat.size > 1024) imagePaths.push(target);
      else await fs.unlink(target).catch(() => undefined);
    } catch (error) {
      console.warn(`[RemasterMixVideoV3] Visual ${index + 1} skipped:`, error instanceof Error ? error.message : error);
      await fs.unlink(target).catch(() => undefined);
    }
  }
  return imagePaths;
}

async function downloadLogo(url: string | null | undefined, workingDirectory: string) {
  if (!url) return null;
  const target = path.join(workingDirectory, "remaster-logo.png");
  try {
    await downloadImage(url, target);
    const stat = await fs.stat(target);
    if (stat.size <= 1024) throw new Error("Logo file is unexpectedly small.");
    return target;
  } catch (error) {
    console.warn("[RemasterMixVideoV3] Logo skipped:", error instanceof Error ? error.message : error);
    await fs.unlink(target).catch(() => undefined);
    return null;
  }
}

function escapeAssFilterPath(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildLoopedVisualFilter(imageCount: number, assPath: string | null, logoInputIndex: number | null = null) {
  if (!Number.isInteger(imageCount) || imageCount < 2) throw new Error("At least two images are required.");
  const parts: string[] = [];
  for (let index = 0; index < imageCount; index += 1) {
    parts.push(
      `[${index}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},setsar=1,fps=${FPS}[v${index}]`,
    );
  }
  const inputs = Array.from({ length: imageCount }, (_, index) => `[v${index}]`).join("");
  parts.push(`${inputs}concat=n=${imageCount}:v=1:a=0[slideshow]`);
  if (assPath) parts.push(`[slideshow]ass=filename='${escapeAssFilterPath(assPath)}'[texted]`);
  else parts.push("[slideshow]null[texted]");

  if (logoInputIndex !== null) {
    parts.push(`[${logoInputIndex}:v]scale=240:-1:force_original_aspect_ratio=decrease[logo]`);
    parts.push("[texted][logo]overlay=x=W-w-38:y=H-h-28:eof_action=repeat:shortest=0,format=yuv420p[vout]");
  } else {
    parts.push("[texted]format=yuv420p[vout]");
  }
  return parts.join(";");
}

export async function renderRemasterLongFormMixV3(input: RemasterMixVideoV3Input): Promise<RemasterMixVideoV3Result> {
  if (input.imageUrls.length < 12) throw new Error("At least 12 visual URLs are required for a long-form mix.");

  const binary = await ensureFFmpeg();
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-mix-video-v3-"));

  try {
    await input.onProgress?.(1, "downloading_visuals_v3");
    const imagePaths = await downloadVisuals(input.imageUrls, workingDirectory);
    if (imagePaths.length < 12) throw new Error(`Only ${imagePaths.length} visuals downloaded; at least 12 are required.`);

    const expectedDuration = input.audioDurationSeconds && input.audioDurationSeconds > 0
      ? input.audioDurationSeconds
      : await probeDuration(binary, input.audioPath);
    const measuredAudioDuration = await probeDuration(binary, input.audioPath);
    if (Math.abs(measuredAudioDuration - expectedDuration) > 2.5) {
      throw new Error(`Mix audio duration mismatch: measured ${measuredAudioDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s.`);
    }

    const segmentDuration = expectedDuration / imagePaths.length;
    let assPath: string | null = null;
    if (input.zenEcoHomesEnabled) {
      assPath = path.join(workingDirectory, "overlay.ass");
      await fs.writeFile(assPath, buildRemasterMixGlobalAssOverlay({
        durationSeconds: expectedDuration,
        sponsorIntervalMinutes: input.sponsorIntervalMinutes,
        ctaText: input.ctaText,
        zenEcoHomesEnabled: true,
      }), "utf8");
    }
    const logoUrl = input.logoUrl || process.env.REMASTER_MIX_LOGO_URL || DEFAULT_REMASTER_LOGO_URL;
    const logoPath = await downloadLogo(logoUrl, workingDirectory);

    const videoPath = path.join(workingDirectory, "remaster-mediterranean-mix-v3.mp4");
    const visualInputs = imagePaths.flatMap((imagePath) => [
      "-loop", "1",
      "-framerate", String(FPS),
      "-t", segmentDuration.toFixed(3),
      "-i", imagePath,
    ]);
    const logoInput = logoPath ? [
      "-loop", "1",
      "-framerate", "1",
      "-t", expectedDuration.toFixed(3),
      "-i", logoPath,
    ] : [];
    const logoInputIndex = logoPath ? imagePaths.length : null;
    const audioIndex = imagePaths.length + (logoPath ? 1 : 0);

    await input.onProgress?.(18, "rendering_visuals_v3");
    await runFFmpeg(binary, [
      "-hide_banner",
      ...visualInputs,
      ...logoInput,
      "-i", input.audioPath,
      "-filter_complex", buildLoopedVisualFilter(imagePaths.length, assPath, logoInputIndex),
      "-map", "[vout]",
      "-map", `${audioIndex}:a:0`,
      "-t", expectedDuration.toFixed(3),
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "30",
      "-r", String(FPS),
      "-c:a", "aac",
      "-b:a", "160k",
      "-movflags", "+faststart",
      "-y",
      videoPath,
    ]);

    const measuredVideoDuration = await probeDuration(binary, videoPath);
    if (Math.abs(measuredVideoDuration - expectedDuration) > 2.5) {
      throw new Error(`Rendered video duration mismatch: measured ${measuredVideoDuration.toFixed(2)}s, expected ${expectedDuration.toFixed(2)}s.`);
    }

    await input.onProgress?.(82, "video_ready_v3");
    for (const imagePath of imagePaths) await fs.unlink(imagePath).catch(() => undefined);
    if (assPath) await fs.unlink(assPath).catch(() => undefined);
    if (logoPath) await fs.unlink(logoPath).catch(() => undefined);

    const stat = await fs.stat(videoPath);
    await input.onProgress?.(85, "video_verified_v3");
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

export async function cleanupRemasterLongFormMixV3(result: Pick<RemasterMixVideoV3Result, "workingDirectory">) {
  if (!result.workingDirectory.includes("remaster-mix-video-v3-")) return;
  await fs.rm(result.workingDirectory, { recursive: true, force: true }).catch(() => undefined);
}
