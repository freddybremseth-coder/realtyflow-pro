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

export interface RemasterMixVideoV4Input {
  audioPath: string;
  imageUrls: string[];
  title: string;
  targetMinutes: number;
  sponsorIntervalMinutes: number;
  ctaText?: string | null;
  zenEcoHomesEnabled: boolean;
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
      console.warn(`[RemasterMixVideoV4] Visual ${index + 1} skipped:`, error instanceof Error ? error.message : error);
      await fs.unlink(target).catch(() => undefined);
    }
  }
  return imagePaths;
}

function escapeAssFilterPath(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export function buildConcatVisualFilterV4(assPath: string | null) {
  const parts = [
    `[0:v]fps=${FPS},scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${WIDTH}:${HEIGHT},setsar=1[slideshow]`,
  ];
  if (assPath) parts.push(`[slideshow]ass=filename='${escapeAssFilterPath(assPath)}'[branded]`);
  else parts.push("[slideshow]null[branded]");
  parts.push("[branded]format=yuv420p[vout]");
  return parts.join(";");
}

export async function renderRemasterLongFormMixV4(input: RemasterMixVideoV4Input): Promise<RemasterMixVideoV4Result> {
  if (input.imageUrls.length < 12) throw new Error("At least 12 visual URLs are required for a long-form mix.");

  const binary = await ensureFFmpeg();
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-mix-video-v4-"));

  try {
    await input.onProgress?.(1, "downloading_visuals_v4");
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
    const concatPath = path.join(workingDirectory, "visuals.ffconcat");
    await fs.writeFile(concatPath, buildVisualConcatFile(imagePaths, segmentDuration), "utf8");

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

    const videoPath = path.join(workingDirectory, "remaster-mediterranean-mix-v4.mp4");
    await input.onProgress?.(18, "rendering_visuals_v4");
    await runFFmpeg(binary, [
      "-hide_banner",
      "-progress", "pipe:2",
      "-nostats",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-i", input.audioPath,
      "-filter_complex", buildConcatVisualFilterV4(assPath),
      "-map", "[vout]",
      "-map", "1:a:0",
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
