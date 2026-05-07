import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  return "jpg";
}

export function canThumbnail(contentType?: string | null) {
  return Boolean(contentType && IMAGE_TYPES.has(contentType));
}

export async function createImageThumbnail(
  input: Buffer,
  contentType: string,
  width = 360,
): Promise<Buffer | null> {
  const binary = ffmpegPath;
  if (!binary || !canThumbnail(contentType)) return null;

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rf-thumb-"));
  const inputPath = path.join(tmp, `input.${extForMime(contentType)}`);
  const outputPath = path.join(tmp, "thumb.jpg");

  try {
    await fs.writeFile(inputPath, input);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binary, [
        "-y",
        "-i",
        inputPath,
        "-vf",
        `scale='min(${width},iw)':-2`,
        "-frames:v",
        "1",
        "-q:v",
        "7",
        outputPath,
      ]);
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += String(chunk);
      });
      proc.on("error", reject);
      proc.on("close", (code: number | null) => {
        code === 0 ? resolve() : reject(new Error(stderr.split("\n").slice(-5).join("\n")));
      });
    });
    return await fs.readFile(outputPath);
  } catch (error) {
    console.warn("[Storage thumbnails] Could not create thumbnail:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function uploadThumbnail(
  supabase: SupabaseClient,
  sourceBuffer: Buffer,
  contentType: string,
  sourcePath: string,
): Promise<string | null> {
  const thumbnail = await createImageThumbnail(sourceBuffer, contentType);
  if (!thumbnail) return null;

  const safePath = sourcePath
    .replace(/\.[^.]+$/, ".jpg")
    .replace(/^\/+/, "")
    .replace(/[^a-zA-Z0-9/._-]/g, "_");
  const thumbnailPath = `previews/${safePath}`;

  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(thumbnailPath, thumbnail, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "31536000",
    });

  if (error) {
    console.warn("[Storage thumbnails] Upload failed:", error.message);
    return null;
  }

  const { data } = supabase.storage.from("thumbnails").getPublicUrl(thumbnailPath);
  return data.publicUrl;
}

export function parseSupabasePublicUrl(url?: string | null) {
  if (!url) return null;
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}
