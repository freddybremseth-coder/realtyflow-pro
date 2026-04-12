/**
 * FFmpeg-based video renderer for Neural Beat pipeline.
 * Replaces Creatomate API with local FFmpeg rendering — zero API cost.
 *
 * MEMORY-OPTIMIZED for Vercel serverless (1024 MB limit):
 *   Uses concat demuxer approach — processes ONE image at a time.
 *   No xfade filter (which holds 2 decoded streams in memory).
 *
 * Creates music videos with:
 *   - Multiple images scaled to 720p
 *   - Smooth slideshow via concat demuxer (sequential, low memory)
 *   - Audio track overlay (determines video duration)
 *   - 720p MP4 output with H.264 + AAC encoding
 *
 * Render time: ~15-40s for a 3.5-minute video
 * Memory usage: ~200-400 MB (vs 800+ MB with xfade)
 * Cost: $0 (fully local rendering)
 */

import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

// ─── FFmpeg binary resolution ────────────────────────────────
const FFMPEG_TMP_PATH = path.join(os.tmpdir(), 'ffmpeg');
const FFMPEG_RELEASE_TAG = 'b6.1.1';
const FFMPEG_DOWNLOAD_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_RELEASE_TAG}/ffmpeg-linux-x64`;

let _ffmpegPath: string | null = null;

export async function ensureFFmpeg(): Promise<string> {
  if (_ffmpegPath) return _ffmpegPath;

  if (process.env.FFMPEG_PATH) {
    _ffmpegPath = process.env.FFMPEG_PATH;
    return _ffmpegPath;
  }

  const localPath = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
  if (fsSync.existsSync(localPath)) {
    try { fsSync.chmodSync(localPath, 0o755); } catch {}
    console.log(`[FFmpeg] Using local binary: ${localPath}`);
    _ffmpegPath = localPath;
    return _ffmpegPath;
  }

  if (fsSync.existsSync(FFMPEG_TMP_PATH)) {
    console.log(`[FFmpeg] Using cached /tmp binary`);
    _ffmpegPath = FFMPEG_TMP_PATH;
    return _ffmpegPath;
  }

  console.log(`[FFmpeg] Downloading binary to /tmp...`);
  const startTime = Date.now();
  const response = await fetch(FFMPEG_DOWNLOAD_URL, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download ffmpeg: ${response.status} ${response.statusText} from ${FFMPEG_DOWNLOAD_URL}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fsSync.writeFileSync(FFMPEG_TMP_PATH, buffer);
  fsSync.chmodSync(FFMPEG_TMP_PATH, 0o755);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[FFmpeg] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB in ${elapsed}s`);
  _ffmpegPath = FFMPEG_TMP_PATH;
  return _ffmpegPath;
}

function getFFmpegPath(): string {
  if (!_ffmpegPath) throw new Error('FFmpeg not initialized — call ensureFFmpeg() first');
  return _ffmpegPath;
}

// ─── Constants ──────────────────────────────────────────────

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;

// ─── Types ──────────────────────────────────────────────────

/**
 * Text overlay for a single video segment.
 * All fields optional - only non-empty fields are rendered.
 */
export interface TextSlide {
  topText?: string;   // Brand name top-left
  mainText?: string;  // Large price/feature text bottom-center
  subText?: string;   // Smaller info below mainText
  ctaText?: string;   // CTA bar at very bottom (website etc.)
}

export interface FFmpegRenderOptions {
  audioUrl: string;
  imagePaths: string[];
  title?: string;
  subtitle?: string;
  duration?: number;
  logoPath?: string;
  /** One TextSlide per image. Cycles if fewer slides than images. */
  textSlides?: TextSlide[];
  onSegmentProgress?: (current: number, total: number) => void;
}

export interface FFmpegRenderResult {
  videoPath: string;
  videoBuffer: Buffer;
  durationSeconds: number;
}

// ─── Utilities ──────────────────────────────────────────────

async function getAudioDuration(audioPath: string): Promise<number> {
  let stderr = '';
  try {
    const result = await execFileAsync(getFFmpegPath(), ['-i', audioPath, '-hide_banner', '-f', 'null', '-']);
    stderr = result.stderr || '';
  } catch (err: any) {
    stderr = err.stderr || '';
  }

  let match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
  }

  // Fallback: ffmpeg -i without output always fails but prints duration
  console.warn('[FFmpeg] Duration fallback: -i only...');
  try {
    await execFileAsync(getFFmpegPath(), ['-i', audioPath, '-hide_banner']);
  } catch (err: any) {
    stderr = err.stderr || '';
  }

  match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (match) {
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
  }

  throw new Error(`Could not determine audio duration (stderr: ${stderr.substring(0, 200)})`);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  // Support local file paths (copy instead of download)
  if (url.startsWith('/') || url.startsWith('file://')) {
    const localPath = url.replace('file://', '');
    console.log(`[FFmpeg] Copying local file: ${localPath}`);
    await fs.copyFile(localPath, destPath);
    const stat = await fs.stat(destPath);
    console.log(`[FFmpeg] Copied: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
    return;
  }
  console.log(`[FFmpeg] Downloading: ${url.substring(0, 80)}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destPath, buffer);
  console.log(`[FFmpeg] Downloaded: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
}

// ─── Text Overlay Helpers ────────────────────────────────────

/** Escape special chars for FFmpeg drawtext option value */
function escapeFfmpegText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Build a comma-chained FFmpeg vf filter string for text overlays.
 * Uses drawbox (for semi-transparent bars) + drawtext.
 * Falls back silently if drawtext is unavailable on target system.
 */
function buildDrawtextFilters(slide: TextSlide): string {
  const parts: string[] = [];

  // ── Top brand bar ──
  if (slide.topText) {
    parts.push(`drawbox=x=0:y=0:w=iw:h=56:color=black@0.65:t=fill`);
    parts.push(`drawtext=fontsize=24:fontcolor=white:x=18:y=17:text='${escapeFfmpegText(slide.topText)}'`);
  }

  // ── Main large text + sub text background bar ──
  if (slide.mainText || slide.subText) {
    const barH = slide.subText ? 100 : 68;
    parts.push(`drawbox=x=0:y=ih-${barH + (slide.ctaText ? 52 : 0)}:w=iw:h=${barH}:color=black@0.72:t=fill`);
  }

  if (slide.mainText) {
    const yOffset = slide.ctaText ? 108 : 56;
    parts.push(`drawtext=fontsize=52:fontcolor=white:x=(w-text_w)/2:y=ih-${yOffset + (slide.subText ? 36 : 0)}:text='${escapeFfmpegText(slide.mainText)}'`);
  }

  if (slide.subText) {
    const yOffset = slide.ctaText ? 62 : 20;
    parts.push(`drawtext=fontsize=26:fontcolor=white@0.88:x=(w-text_w)/2:y=ih-${yOffset}:text='${escapeFfmpegText(slide.subText)}'`);
  }

  // ── Bottom CTA bar ──
  if (slide.ctaText) {
    parts.push(`drawbox=x=0:y=ih-50:w=iw:h=50:color=black@0.88:t=fill`);
    parts.push(`drawtext=fontsize=26:fontcolor=0x22d3ee:x=(w-text_w)/2:y=ih-35:text='${escapeFfmpegText(slide.ctaText)}'`);
  }

  return parts.join(',');
}

function runFFmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFFmpegPath(), args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const MAX_STDERR = 10000;

    proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      if (stderr.length < MAX_STDERR) stderr += text.slice(0, MAX_STDERR - stderr.length);
    });

    proc.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else {
        const errorLines = stderr.split('\n').filter(l => l.trim()).slice(-5).join('\n');
        reject(new Error(`FFmpeg exit ${code}:\n${errorLines}`));
      }
    });

    proc.on('error', (err) => reject(new Error(`FFmpeg process error: ${err.message}`)));
  });
}

// ─── Main Render Function ───────────────────────────────────

/**
 * Render a music video using FFmpeg concat demuxer.
 *
 * MEMORY-EFFICIENT: Instead of xfade filter_complex (which holds multiple
 * decoded streams in memory), we use the concat demuxer approach:
 *   1. Scale each image to a temp video file (one at a time)
 *   2. Create a concat file listing all segments
 *   3. Single final pass: concat + audio overlay
 *
 * This processes ONE image at a time, using ~200-400 MB total.
 */
export async function renderVideo(options: FFmpegRenderOptions): Promise<FFmpegRenderResult> {
  const imageCount = options.imagePaths.length;
  if (imageCount === 0) throw new Error('At least one image is required');

  await ensureFFmpeg();

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neural-beat-'));
  console.log(`[FFmpeg] Working directory: ${tempDir}`);

  try {
    // ── Download audio ──
    const audioPath = path.join(tempDir, 'audio.mp3');
    await downloadFile(options.audioUrl, audioPath);

    // ── Get audio duration ──
    const audioDuration = options.duration || await getAudioDuration(audioPath);
    console.log(`[FFmpeg] Audio duration: ${audioDuration.toFixed(1)}s`);

    const segmentDuration = audioDuration / imageCount;
    console.log(`[FFmpeg] ${imageCount} images × ${segmentDuration.toFixed(1)}s each`);

    // ── Step 1: Create individual video segments (one at a time = low memory) ──
    const segmentPaths: string[] = [];

    for (let i = 0; i < imageCount; i++) {
      const segPath = path.join(tempDir, `seg-${i}.ts`);
      segmentPaths.push(segPath);

      console.log(`[FFmpeg] Encoding segment ${i + 1}/${imageCount}...`);
      options.onSegmentProgress?.(i + 1, imageCount);

      // ── Pre-scale image to target resolution + optional logo overlay ──
      // Avoids scaling every frame during encoding (huge speedup for large images)
      const scaledPath = path.join(tempDir, `scaled-${i}.jpg`);
      if (options.logoPath && fsSync.existsSync(options.logoPath)) {
        // Scale image, then overlay logo in bottom-right corner (120px wide, 16px padding)
        await runFFmpeg([
          '-i', options.imagePaths[i],
          '-i', options.logoPath,
          '-filter_complex',
          `[0]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}[bg];[1]scale=120:-1[logo];[bg][logo]overlay=W-w-16:H-h-16`,
          '-q:v', '2',
          '-y',
          scaledPath,
        ]);
      } else {
        await runFFmpeg([
          '-i', options.imagePaths[i],
          '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
          '-q:v', '2',
          '-y',
          scaledPath,
        ]);
      }

      // ── Apply text overlay (drawtext) if textSlides provided ──
      let segmentSourcePath = scaledPath;
      if (options.textSlides && options.textSlides.length > 0) {
        const slide = options.textSlides[i % options.textSlides.length];
        const filterStr = buildDrawtextFilters(slide);
        if (filterStr) {
          const textPath = path.join(tempDir, `text-${i}.jpg`);
          try {
            await runFFmpeg(['-i', scaledPath, '-vf', filterStr, '-q:v', '2', '-y', textPath]);
            segmentSourcePath = textPath;
          } catch (textErr) {
            console.warn(`[FFmpeg] Text overlay failed for seg ${i} (drawtext unavailable?), skipping:`, (textErr as Error).message.substring(0, 100));
          }
        }
      }

      // ── Encode pre-scaled image → video clip ──
      // Optimized for speed on serverless (Vercel throttles CPU on long tasks):
      //   - 2fps: static images don't need more (7.5x less work vs 15fps)
      //   - Pre-scaled input: no per-frame scaling needed
      //   - CRF 30: fast encoding, YouTube re-encodes anyway
      //   - No thread limit: use all available CPU cores
      await runFFmpeg([
        '-loop', '1',
        '-framerate', '2',
        '-i', segmentSourcePath,
        '-t', segmentDuration.toFixed(2),
        '-vf', 'format=yuv420p',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-r', '2',
        '-an',  // No audio in segments
        '-y',
        segPath,
      ]);
    }

    console.log(`[FFmpeg] All ${imageCount} segments encoded`);

    // ── Step 2: Create concat file ──
    const concatPath = path.join(tempDir, 'concat.txt');
    const concatContent = segmentPaths.map(p => `file '${p}'`).join('\n');
    await fs.writeFile(concatPath, concatContent, 'utf-8');

    // ── Step 3: Concat all segments + add audio (single lightweight pass) ──
    const outputPath = path.join(tempDir, 'output.mp4');
    console.log('[FFmpeg] Final concat + audio merge...');
    const startTime = Date.now();

    await runFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-i', audioPath,
      '-c:v', 'copy',        // Just copy video — already encoded!
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);

    const renderTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FFmpeg] Concat complete in ${renderTime}s`);

    // ── Clean up segment + scaled + text image files to save /tmp space ──
    for (const segPath of segmentPaths) {
      try { await fs.unlink(segPath); } catch {}
    }
    for (let i = 0; i < imageCount; i++) {
      try { await fs.unlink(path.join(tempDir, `scaled-${i}.jpg`)); } catch {}
      try { await fs.unlink(path.join(tempDir, `text-${i}.jpg`)); } catch {}
    }

    // ── Read output ──
    const videoBuffer = await fs.readFile(outputPath);
    const sizeMB = (videoBuffer.length / 1024 / 1024).toFixed(1);
    console.log(`[FFmpeg] Output: ${sizeMB} MB`);

    return { videoPath: outputPath, videoBuffer, durationSeconds: audioDuration };
  } catch (error) {
    try { await fs.rm(tempDir, { recursive: true }); } catch {}
    throw error;
  }
}

// ─── Cleanup ────────────────────────────────────────────────

export async function cleanupRender(videoPath: string): Promise<void> {
  const tempDir = path.dirname(videoPath);
  if (tempDir.includes('neural-beat-')) {
    try {
      await fs.rm(tempDir, { recursive: true });
      console.log('[FFmpeg] Cleaned up temp directory');
    } catch {
      console.warn('[FFmpeg] Could not clean up temp directory:', tempDir);
    }
  }
}

// ─── Health Check ───────────────────────────────────────────

export async function isAvailable(): Promise<boolean> {
  try {
    const ffmpegPath = await ensureFFmpeg();
    const { stdout } = await execFileAsync(ffmpegPath, ['-version']);
    console.log(`[FFmpeg] Available: ${stdout.split('\n')[0]}`);
    return true;
  } catch (err) {
    console.error('[FFmpeg] isAvailable failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

export function isConfigured(): boolean {
  return true;
}
