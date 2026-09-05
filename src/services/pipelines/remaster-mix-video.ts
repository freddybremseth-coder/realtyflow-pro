import { execFile, spawn } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";

const execFileAsync = promisify(execFile);
const WIDTH = 1920;
const HEIGHT = 1080;
const LONGFORM_FPS = 6;

export interface RemasterMixVideoInput {
  audioPath: string;
  imageUrls: string[];
  title: string;
  targetMinutes: number;
  sponsorIntervalMinutes: number;
  ctaText?: string | null;
  zenEcoHomesEnabled: boolean;
  audioDurationSeconds?: number | null;
  onProgress?: (progress: number, step: string) => void | Promise<void>;
}

export interface RemasterMixVideoResult {
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

async function probeDuration(binary: string, audioPath: string) {
  let stderr = "";
  try {
    const result = await execFileAsync(binary, ["-i", audioPath, "-hide_banner", "-f", "null", "-"]);
    stderr = result.stderr || "";
  } catch (error: any) {
    stderr = error?.stderr || "";
  }
  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!match) throw new Error("Could not determine long-form mix audio duration.");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4]}`);
}

async function downloadImage(url: string, destination: string) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Image download failed (${response.status})`);
  await pipeline(Readable.fromWeb(response.body as any), fsSync.createWriteStream(destination));
}

async function downloadVisuals(urls: string[], workingDirectory: string) {
  const imagePaths: string[] = [];
  // Sequential downloads are deliberately conservative: property feeds can
  // point at several different CDNs and a long mix may use 90–180 images.
  for (let index = 0; index < urls.length; index += 1) {
    const target = path.join(workingDirectory, `visual-${String(index).padStart(3, "0")}.jpg`);
    try {
      await downloadImage(urls[index], target);
      const stat = await fs.stat(target);
      if (stat.size > 8 * 1024) imagePaths.push(target);
      else await fs.unlink(target).catch(() => undefined);
    } catch (error) {
      console.warn(`[RemasterMixVideo] Visual ${index + 1} skipped:`, error instanceof Error ? error.message : error);
      await fs.unlink(target).catch(() => undefined);
    }
  }
  return imagePaths;
}

function assTime(seconds: number) {
  const centiseconds = Math.max(1, Math.ceil(Math.max(0, seconds) * 100));
  const hours = Math.floor(centiseconds / 360000);
  const minutes = Math.floor((centiseconds % 360000) / 6000);
  const secs = Math.floor((centiseconds % 6000) / 100);
  const cs = centiseconds % 100;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(value: string) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/[{}]/g, "")
    .replace(/\r?\n/g, "\\N")
    .trim();
}

/**
 * Build an Advanced SubStation Alpha overlay instead of relying on FFmpeg's
 * drawtext filter. The ffmpeg-static build used by the production worker ships
 * libass but does not expose drawtext, so ASS gives us deterministic text boxes
 * without adding a second FFmpeg binary or a native image dependency.
 */
export function buildRemasterMixAssOverlay(input: {
  durationSeconds: number;
  sponsorSlide: boolean;
  ctaText?: string | null;
  zenEcoHomesEnabled: boolean;
}) {
  if (!input.zenEcoHomesEnabled) return "";

  const end = assTime(input.durationSeconds);
  const events = [
    `Dialogue: 0,0:00:00.00,${end},Watermark,,0,0,0,,ZenEcoHomes.com`,
  ];

  if (input.sponsorSlide) {
    events.push(
      `Dialogue: 1,0:00:00.00,${end},Sponsor,,0,0,0,,{\\pos(960,464)}Presented by ZenEcoHomes.com`,
    );
    if (input.ctaText?.trim()) {
      events.push(
        `Dialogue: 1,0:00:00.00,${end},CTA,,0,0,0,,{\\pos(960,594)}${escapeAssText(input.ctaText)}`,
      );
    }
  }

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${WIDTH}`,
    `PlayResY: ${HEIGHT}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    "Style: Watermark,DejaVu Sans,27,&H00FFFFFF,&H000000FF,&H70000000,&H70000000,-1,0,0,0,100,100,0,0,3,0,0,9,34,34,30,1",
    "Style: Sponsor,DejaVu Sans,58,&H00FFFFFF,&H000000FF,&H61000000,&H61000000,-1,0,0,0,100,100,0,0,3,0,0,5,30,30,20,1",
    "Style: CTA,DejaVu Sans,30,&H00FFFFFF,&H000000FF,&H70000000,&H70000000,0,0,0,0,100,100,0,0,3,0,0,5,40,40,20,1",
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
}

function escapeAssFilterPath(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function buildOverlayFilter(input: {
  imageIndex: number;
  frames: number;
  assPath?: string | null;
}) {
  const motionPatterns = [
    `zoompan=z='min(zoom+0.00022,1.065)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${input.frames}:s=${WIDTH}x${HEIGHT}:fps=${LONGFORM_FPS}`,
    `zoompan=z='min(zoom+0.00018,1.055)':x='min(max(0,on*0.20),iw-iw/zoom)':y='ih/2-(ih/zoom/2)':d=${input.frames}:s=${WIDTH}x${HEIGHT}:fps=${LONGFORM_FPS}`,
    `zoompan=z='min(zoom+0.00018,1.055)':x='max(0,iw-iw/zoom-on*0.20)':y='ih/2-(ih/zoom/2)':d=${input.frames}:s=${WIDTH}x${HEIGHT}:fps=${LONGFORM_FPS}`,
  ];

  const filters = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${WIDTH}:${HEIGHT}`,
    motionPatterns[input.imageIndex % motionPatterns.length],
  ];

  if (input.assPath) {
    filters.push(`ass=filename='${escapeAssFilterPath(input.assPath)}'`);
  }

  filters.push("format=yuv420p");
  return filters.join(",");
}

/**
 * Disk-based renderer for 30–180 minute Re-Master mixes. Unlike the existing
 * single-song renderer, this function never reads the final MP4 into a Buffer.
 */
export async function renderRemasterLongFormMix(input: RemasterMixVideoInput): Promise<RemasterMixVideoResult> {
  if (input.imageUrls.length < 12) throw new Error("At least 12 visual URLs are required for a long-form mix.");

  const binary = await ensureFFmpeg();
  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "remaster-mix-video-"));

  try {
    await input.onProgress?.(1, "downloading_visuals");
    const imagePaths = await downloadVisuals(input.imageUrls, workingDirectory);
    if (imagePaths.length < 12) {
      throw new Error(`Only ${imagePaths.length} ZenEcoHomes images downloaded successfully; at least 12 are required.`);
    }

    const durationSeconds = input.audioDurationSeconds && input.audioDurationSeconds > 0
      ? input.audioDurationSeconds
      : await probeDuration(binary, input.audioPath);
    const segmentDuration = durationSeconds / imagePaths.length;
    const sponsorEveryImages = Math.max(
      1,
      Math.round((Math.max(5, input.sponsorIntervalMinutes) * 60) / segmentDuration),
    );

    const segmentPaths: string[] = [];
    for (let index = 0; index < imagePaths.length; index += 1) {
      const segmentPath = path.join(workingDirectory, `segment-${String(index).padStart(3, "0")}.ts`);
      const frames = Math.max(1, Math.round(segmentDuration * LONGFORM_FPS));
      const sponsorSlide = index === 0 || index % sponsorEveryImages === 0;
      let assPath: string | null = null;

      if (input.zenEcoHomesEnabled) {
        assPath = path.join(workingDirectory, `overlay-${String(index).padStart(3, "0")}.ass`);
        await fs.writeFile(
          assPath,
          buildRemasterMixAssOverlay({
            durationSeconds: segmentDuration,
            sponsorSlide,
            ctaText: input.ctaText,
            zenEcoHomesEnabled: true,
          }),
          "utf8",
        );
      }

      const filter = buildOverlayFilter({
        imageIndex: index,
        frames,
        assPath,
      });

      await runFFmpeg(binary, [
        "-loop", "1",
        "-framerate", String(LONGFORM_FPS),
        "-i", imagePaths[index],
        "-t", segmentDuration.toFixed(3),
        "-vf", filter,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "29",
        "-r", String(LONGFORM_FPS),
        "-an",
        "-y",
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);

      const progress = 10 + Math.round(((index + 1) / imagePaths.length) * 65);
      await input.onProgress?.(progress, "rendering_visuals");
    }

    const concatPath = path.join(workingDirectory, "segments.txt");
    await fs.writeFile(concatPath, segmentPaths.map((file) => `file '${file}'`).join("\n"), "utf8");

    const videoPath = path.join(workingDirectory, "remaster-mediterranean-mix.mp4");
    await input.onProgress?.(78, "muxing_audio");
    await runFFmpeg(binary, [
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-i", input.audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "160k",
      "-shortest",
      "-movflags", "+faststart",
      "-y",
      videoPath,
    ]);

    // Keep only the final MP4 after muxing; this can reclaim multiple GB before
    // the resumable YouTube upload starts.
    for (const segmentPath of segmentPaths) await fs.unlink(segmentPath).catch(() => undefined);
    for (const imagePath of imagePaths) await fs.unlink(imagePath).catch(() => undefined);
    await fs.unlink(concatPath).catch(() => undefined);
    const overlayFiles = await fs.readdir(workingDirectory).catch(() => [] as string[]);
    for (const file of overlayFiles) {
      if (file.startsWith("overlay-") && file.endsWith(".ass")) {
        await fs.unlink(path.join(workingDirectory, file)).catch(() => undefined);
      }
    }

    const stat = await fs.stat(videoPath);
    await input.onProgress?.(85, "video_ready");
    return {
      videoPath,
      workingDirectory,
      durationSeconds,
      imageCount: imagePaths.length,
      fileSizeBytes: stat.size,
    };
  } catch (error) {
    await fs.rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function cleanupRemasterLongFormMix(result: Pick<RemasterMixVideoResult, "workingDirectory">) {
  if (!result.workingDirectory.includes("remaster-mix-video-")) return;
  await fs.rm(result.workingDirectory, { recursive: true, force: true }).catch(() => undefined);
}
