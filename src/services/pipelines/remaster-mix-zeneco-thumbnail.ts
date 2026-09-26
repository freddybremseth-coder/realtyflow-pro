import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { ensureFFmpeg } from "@/services/integrations/ffmpeg-renderer";
import { ZENECO_WATERMARK_SVG_URL } from "@/lib/brand-assets";

const execFileAsync = promisify(execFile);

async function download(url: string, dest: string) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`ZEN_THUMB_SOURCE_HTTP_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > 15 * 1024 * 1024) throw new Error("ZEN_THUMB_SOURCE_INVALID");
  await fs.writeFile(dest, bytes);
}

export async function renderZenEcoYoutubeThumbnail(imageUrl: string): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zeneco-youtube-thumb-"));
  try {
    const source = path.join(dir, "source");
    const logo = path.join(dir, "zeneco-watermark.svg");
    const out = path.join(dir, "thumb.jpg");
    await Promise.all([
      download(imageUrl, source),
      download(ZENECO_WATERMARK_SVG_URL, logo),
    ]);

    const ffmpeg = await ensureFFmpeg();
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-i", source,
      "-framerate", "1", "-i", logo,
      "-filter_complex",
      "[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720[bg];" +
      "[1:v]scale=430:-1:force_original_aspect_ratio=decrease[logo];" +
      "[bg][logo]overlay=W-w-40:H-h-34:format=auto,format=yuvj420p[vout]",
      "-map", "[vout]",
      "-frames:v", "1",
      "-q:v", "2",
      "-y", out,
    ], { timeout: 35_000 });

    return await fs.readFile(out);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
