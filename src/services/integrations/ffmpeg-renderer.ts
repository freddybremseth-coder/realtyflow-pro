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

// Full HD gir merkbart skarpere bilde på TV-er og store skjermer. 2 fps
// stillbilder holder kodekostnaden lav selv i 1080p.
const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

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
  overlayStyle?: 'property-details';
  detailsKicker?: string;
  detailsText?: string;
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
  /**
   * Apply Ken Burns (slow zoom/pan) motion on each image segment. Cycles
   * through 5 patterns for variety. Adds ~30-60% to render time at 12 fps but
   * dramatically increases watch-through rate on music videos. Default: true.
   */
  kenBurns?: boolean;
  /** Framerate for Ken Burns motion (default 12). Higher = smoother, slower. */
  kenBurnsFps?: number;
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

// ─── Font Management ────────────────────────────────────────

const FONT_TMP_PATH = path.join(os.tmpdir(), 'render-font.ttf');
const FONT_BOLD_TMP_PATH = path.join(os.tmpdir(), 'render-font-bold.ttf');
// Google Fonts CDN – Inter (clean, modern, excellent for real estate)
const FONT_URL = 'https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf';
const FONT_BOLD_URL = FONT_URL; // Variable font — same file, weight set via drawtext

let _fontPath: string | null = null;

/**
 * Ensure a TTF font is available for drawtext.
 * Checks macOS system fonts first, then downloads from Google Fonts to /tmp.
 */
export async function ensureFont(): Promise<string> {
  if (_fontPath) return _fontPath;

  // 1. Check macOS system fonts (for local dev)
  const macFonts = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
    '/System/Library/Fonts/SFCompact.ttf',
  ];
  for (const f of macFonts) {
    if (fsSync.existsSync(f)) {
      console.log(`[FFmpeg] Using system font: ${f}`);
      _fontPath = f;
      return _fontPath;
    }
  }

  // 2. Check Linux common paths (Vercel serverless)
  const linuxFonts = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ];
  for (const f of linuxFonts) {
    if (fsSync.existsSync(f)) {
      console.log(`[FFmpeg] Using system font: ${f}`);
      _fontPath = f;
      return _fontPath;
    }
  }

  // 3. Check /tmp cache
  if (fsSync.existsSync(FONT_TMP_PATH)) {
    console.log(`[FFmpeg] Using cached font from /tmp`);
    _fontPath = FONT_TMP_PATH;
    return _fontPath;
  }

  // 4. Download font to /tmp
  console.log(`[FFmpeg] Downloading font to /tmp...`);
  try {
    const res = await fetch(FONT_URL, { redirect: 'follow' });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fsSync.writeFileSync(FONT_TMP_PATH, buf);
      console.log(`[FFmpeg] Font downloaded: ${(buf.length / 1024).toFixed(0)} KB`);
      _fontPath = FONT_TMP_PATH;
      return _fontPath;
    }
  } catch (err) {
    console.warn(`[FFmpeg] Font download failed:`, err);
  }

  // 5. Last resort — return empty string (drawtext will try default)
  console.warn(`[FFmpeg] No font found, drawtext may fail`);
  _fontPath = '';
  return _fontPath;
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
 * Uses drawbox (for semi-transparent bars) + drawtext with explicit fontfile.
 *
 * All drawtext calls use `shadowcolor=black:shadowx=2:shadowy=2` so the text
 * stays readable even on the rare frame where the drawbox doesn't fully
 * cover behind it (or when a background image has high-contrast detail
 * leaking through the alpha).
 */
function buildDrawtextFilters(slide: TextSlide, fontPath: string): string {
  const parts: string[] = [];
  // fontfile parameter — essential for drawtext to work on serverless
  const ff = fontPath ? `fontfile='${fontPath.replace(/'/g, "\\'")}'\\:` : '';
  const shadow = `shadowcolor=black@0.85\\:shadowx=2\\:shadowy=2`;

  if (slide.overlayStyle === 'property-details') {
    if (slide.detailsKicker || slide.detailsText) {
      // Subtle premium strip: readable on mobile, but low enough and calm
      // enough that the property video remains the hero.
      parts.push(`drawbox=x=0:y=ih-104:w=iw:h=104:color=black@0.48:t=fill`);
      parts.push(`drawbox=x=0:y=ih-104:w=iw:h=2:color=white@0.20:t=fill`);
    }

    if (slide.detailsKicker) {
      parts.push(`drawtext=${ff}fontsize=24:fontcolor=white@0.82:${shadow}:x=42:y=ih-86:text='${escapeFfmpegText(slide.detailsKicker)}'`);
    }

    if (slide.detailsText) {
      parts.push(`drawtext=${ff}fontsize=32:fontcolor=white:${shadow}:x=42:y=ih-52:text='${escapeFfmpegText(slide.detailsText)}'`);
    }

    return parts.join(',');
  }

  // ── Top brand bar (full width, prominent) ──
  if (slide.topText) {
    parts.push(`drawbox=x=0:y=0:w=iw:h=64:color=black@0.72:t=fill`);
    parts.push(`drawtext=${ff}fontsize=28:fontcolor=white:${shadow}:x=24:y=18:text='${escapeFfmpegText(slide.topText)}'`);
  }

  // ── Main large text + sub text background bar (taller for readability) ──
  if (slide.mainText || slide.subText) {
    const barH = slide.subText ? 140 : 90;
    const barY = slide.ctaText ? barH + 60 : barH;
    parts.push(`drawbox=x=0:y=ih-${barY}:w=iw:h=${barH}:color=black@0.78:t=fill`);
  }

  if (slide.mainText) {
    // Bumped 56 → 68: price/headline numbers are the hero on a property
    // video, they need to read on a thumbnail-sized phone preview.
    const yOffset = slide.ctaText ? 138 : 78;
    const subOffset = slide.subText ? 44 : 0;
    parts.push(`drawtext=${ff}fontsize=68:fontcolor=white:${shadow}:x=(w-text_w)/2:y=ih-${yOffset + subOffset}:text='${escapeFfmpegText(slide.mainText)}'`);
  }

  if (slide.subText) {
    // Bumped 28 → 34: rooms / m² / location were too small to read on mobile
    const yOffset = slide.ctaText ? 82 : 30;
    parts.push(`drawtext=${ff}fontsize=34:fontcolor=white@0.95:${shadow}:x=(w-text_w)/2:y=ih-${yOffset}:text='${escapeFfmpegText(slide.subText)}'`);
  }

  // ── Bottom CTA bar (always prominent — brand color accent) ──
  if (slide.ctaText) {
    parts.push(`drawbox=x=0:y=ih-58:w=iw:h=58:color=0x0891b2@0.92:t=fill`);
    parts.push(`drawtext=${ff}fontsize=30:fontcolor=white:${shadow}:x=(w-text_w)/2:y=ih-42:text='${escapeFfmpegText(slide.ctaText)}'`);
  }

  return parts.join(',');
}

// ─── Ken Burns (zoompan) motion patterns ────────────────────

/**
 * Build a zoompan filter expression for a given motion pattern.
 *
 * Uses `on` (current output frame number) and `d` (total output frames) to
 * interpolate zoom/x/y smoothly. Output is always 1280x720.
 *
 * Patterns:
 *   0 zoom-in-center:  1.00 → 1.10, centered
 *   1 zoom-out-center: 1.10 → 1.00, centered
 *   2 pan-right:       zoom 1.08, slides left → right
 *   3 pan-left:        zoom 1.08, slides right → left
 *   4 zoom-in-topright: 1.00 → 1.10, drifts toward top-right
 */
function buildKenBurnsFilter(patternIndex: number, totalFrames: number, fps: number): string {
  const d = Math.max(1, Math.round(totalFrames));
  const p = Math.abs(patternIndex) % 5;
  // Reference zoom for pure pans
  const panZoom = '1.08';

  let z: string;
  let x: string;
  let y: string;

  switch (p) {
    case 0:
      // Zoom in, centered
      z = `'1+0.10*on/${d}'`;
      x = `'iw/2-(iw/zoom/2)'`;
      y = `'ih/2-(ih/zoom/2)'`;
      break;
    case 1:
      // Zoom out, centered (clamp to 1.0 so output never falls below input res)
      z = `'max(1.10-0.10*on/${d},1.0)'`;
      x = `'iw/2-(iw/zoom/2)'`;
      y = `'ih/2-(ih/zoom/2)'`;
      break;
    case 2:
      // Pan right at fixed zoom
      z = `'${panZoom}'`;
      x = `'(iw-iw/zoom)*on/${d}'`;
      y = `'ih/2-(ih/zoom/2)'`;
      break;
    case 3:
      // Pan left at fixed zoom
      z = `'${panZoom}'`;
      x = `'(iw-iw/zoom)*(1-on/${d})'`;
      y = `'ih/2-(ih/zoom/2)'`;
      break;
    case 4:
    default:
      // Zoom in toward top-right
      z = `'1+0.10*on/${d}'`;
      x = `'(iw-iw/zoom)*0.5+(iw-iw/zoom)*0.5*on/${d}'`;
      y = `'(ih-ih/zoom)*0.5-(ih-ih/zoom)*0.5*on/${d}'`;
      break;
  }

  return `zoompan=z=${z}:x=${x}:y=${y}:d=${d}:s=${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}:fps=${fps}`;
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

    // ── Ensure font is available for text overlays ──
    let fontPath = '';
    if (options.textSlides && options.textSlides.length > 0) {
      fontPath = await ensureFont();
      console.log(`[FFmpeg] Font for text overlays: ${fontPath || '(none, will try default)'}`);
    }

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
          `[0]scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}[bg];[1]scale=170:-1[logo];[bg][logo]overlay=W-w-24:H-h-24`,
          '-q:v', '2',
          '-y',
          scaledPath,
        ]);
      } else {
        await runFFmpeg([
          '-i', options.imagePaths[i],
          '-vf', `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase:flags=lanczos,crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
          '-q:v', '2',
          '-y',
          scaledPath,
        ]);
      }

      // ── Apply text overlay (drawtext) if textSlides provided ──
      let segmentSourcePath = scaledPath;
      if (options.textSlides && options.textSlides.length > 0) {
        const slide = options.textSlides[i % options.textSlides.length];
        const filterStr = buildDrawtextFilters(slide, fontPath);
        if (filterStr) {
          const textPath = path.join(tempDir, `text-${i}.jpg`);
          try {
            await runFFmpeg(['-i', scaledPath, '-vf', filterStr, '-q:v', '2', '-y', textPath]);
            segmentSourcePath = textPath;
            console.log(`[FFmpeg] Text overlay applied to seg ${i}`);
          } catch (textErr) {
            console.error(`[FFmpeg] Text overlay FAILED for seg ${i}:`, (textErr as Error).message.substring(0, 200));
            // Continue without text — better than crashing the whole render
          }
        }
      }

      // ── Encode pre-scaled image → video clip ──
      // Two modes:
      //  A) Ken Burns (default): zoompan gives slow zoom/pan per segment. Uses
      //     12 fps to balance smooth motion with serverless CPU budget. Cycles
      //     through 5 motion patterns for visual variety.
      //  B) Static (kenBurns:false): the original 2 fps still-image encoding,
      //     kept for the property-video pipeline which uses text-heavy slides.
      const kenBurnsOn = options.kenBurns !== false;
      const kbFps = options.kenBurnsFps || 12;

      if (kenBurnsOn) {
        const totalFrames = Math.max(1, Math.round(segmentDuration * kbFps));
        const kenBurns = buildKenBurnsFilter(i, totalFrames, kbFps);
        await runFFmpeg([
          '-loop', '1',
          '-framerate', String(kbFps),
          '-i', segmentSourcePath,
          '-t', segmentDuration.toFixed(2),
          '-vf', `${kenBurns},format=yuv420p`,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-r', String(kbFps),
          '-an',
          '-y',
          segPath,
        ]);
      } else {
        await runFFmpeg([
          '-loop', '1',
          '-framerate', '2',
          '-i', segmentSourcePath,
          '-t', segmentDuration.toFixed(2),
          '-vf', 'format=yuv420p',
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '24',
          '-r', '2',
          '-an',
          '-y',
          segPath,
        ]);
      }
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
