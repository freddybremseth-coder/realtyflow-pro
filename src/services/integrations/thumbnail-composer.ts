/**
 * Thumbnail composer — builds a branded YouTube thumbnail (1280×720) from an
 * AI-generated background image + hook text + optional logo using FFmpeg.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────┐
 *   │ [brand badge]                                │
 *   │                                              │
 *   │   HOOK TEXT (big, caps, white)              │
 *   │   subtext (accent color)                    │
 *   │                                              │
 *   │                                     [logo] │
 *   └──────────────────────────────────────────────┘
 *
 * Uses a dark gradient on the left third for text legibility. YouTube
 * thumbnail spec: 1280×720, <2 MB, PNG/JPG.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ensureFFmpeg, ensureFont } from './ffmpeg-renderer';

// ─── Types ──────────────────────────────────────────────────

export interface ThumbnailComposeOptions {
  /** Background image (PNG/JPG buffer) — typically an AI-generated 16:9 image. */
  backgroundBuffer: Buffer;
  /** 2-4 caps words, big, high-impact. Example: "DEEP VIBES", "STUDY FLOW". */
  hook: string;
  /** 1-3 words, smaller, accent colored. Example: "Lo-Fi Beats 2026". */
  subtext?: string;
  /** Song title drawn below the hook in accent color. Takes precedence over subtext. */
  titleText?: string;
  /** Brand badge shown top-left. Defaults to "RE-MASTER FREDDY". */
  brand?: string;
  /** Optional PNG logo placed bottom-right. */
  logoBuffer?: Buffer;
  /** Accent color for subtext (hex, no leading #). */
  accentColor?: string;
  /** Stamp/emoji shown top-right. Example: "🔥" or "NEW". */
  stamp?: string;
}

export interface ThumbnailVariantSpec {
  hook: string;
  subtext?: string;
  accentColor?: string;
  stamp?: string;
}

// ─── Accent color palette ───────────────────────────────────

const ACCENT_COLORS = ['ffe066', 'ff6bcb', '66e5ff', '7cffa5', 'ff9966'];

function pickAccent(index: number): string {
  return ACCENT_COLORS[index % ACCENT_COLORS.length];
}

// ─── FFmpeg text escaping ───────────────────────────────────

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function runFFmpeg(ffmpegPath: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 5000) stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else {
        const lastLines = stderr.split('\n').filter((l) => l.trim()).slice(-5).join('\n');
        reject(new Error(`Thumbnail FFmpeg exit ${code}:\n${lastLines}`));
      }
    });
    proc.on('error', (err) => reject(err));
  });
}

// ─── Layout helpers ─────────────────────────────────────────

/**
 * Split hook into 1-2 lines to keep font size high.
 * - ≤12 chars → 1 line, font 130
 * - 13-22 chars → break on word boundary, 2 lines, font 110
 * - >22 chars  → 2 lines, font 90
 */
function splitHook(hook: string): { lines: string[]; fontSize: number } {
  const upper = hook.toUpperCase().trim();
  if (upper.length <= 12) return { lines: [upper], fontSize: 130 };

  const words = upper.split(/\s+/);
  if (words.length === 1) return { lines: [upper], fontSize: upper.length > 16 ? 90 : 110 };

  let best: { lines: string[]; diff: number } = { lines: [upper], diff: 999 };
  for (let split = 1; split < words.length; split++) {
    const a = words.slice(0, split).join(' ');
    const b = words.slice(split).join(' ');
    const diff = Math.abs(a.length - b.length);
    if (diff < best.diff) best = { lines: [a, b], diff };
  }

  const longest = Math.max(...best.lines.map((l) => l.length));
  const fontSize = longest > 18 ? 90 : longest > 12 ? 110 : 130;
  return { lines: best.lines, fontSize };
}

// ─── Main compose ───────────────────────────────────────────

/**
 * Compose a single thumbnail and return the PNG buffer.
 */
export async function composeThumbnail(
  options: ThumbnailComposeOptions
): Promise<Buffer> {
  const ffmpegPath = await ensureFFmpeg();
  const fontPath = await ensureFont();
  const ff = fontPath ? `fontfile='${fontPath.replace(/'/g, "\\'")}'\\:` : '';

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-'));
  const bgPath = path.join(tempDir, 'bg.png');
  const outPath = path.join(tempDir, 'thumb.png');
  await fs.writeFile(bgPath, options.backgroundBuffer);

  const brand = (options.brand || 'RE-MASTER FREDDY').toUpperCase();
  const accent = options.accentColor || pickAccent(0);
  const { lines, fontSize } = splitHook(options.hook);

  const filters: string[] = [];

  filters.push('scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720');

  filters.push('drawbox=x=0:y=0:w=iw*0.62:h=ih:color=black@0.55:t=fill');
  filters.push('drawbox=x=iw*0.55:y=0:w=iw*0.07:h=ih:color=black@0.25:t=fill');

  filters.push(`drawbox=x=28:y=28:w=${Math.min(brand.length * 14 + 40, 440)}:h=46:color=0x0891b2@0.95:t=fill`);
  filters.push(
    `drawtext=${ff}fontsize=22:fontcolor=white:x=44:y=42:text='${escapeDrawtext(brand)}'`
  );

  if (options.stamp) {
    filters.push(`drawbox=x=iw-120:y=28:w=92:h=46:color=0xff3366@0.92:t=fill`);
    filters.push(
      `drawtext=${ff}fontsize=26:fontcolor=white:x=iw-110:y=38:text='${escapeDrawtext(options.stamp)}'`
    );
  }

  // Secondary line below the hook: the song title when provided, otherwise
  // the SEO subtext. Long titles get a smaller font and are truncated so
  // they stay inside the dark gradient area.
  const rawSecondary = (options.titleText || options.subtext || '').trim();
  const secondary = rawSecondary.length > 38 ? `${rawSecondary.slice(0, 37).trimEnd()}…` : rawSecondary;
  const secondaryFontSize = secondary.length > 26 ? 36 : 44;

  const lineSpacing = Math.round(fontSize * 0.1);
  const totalHookHeight = lines.length * fontSize + (lines.length - 1) * lineSpacing;
  const subHeight = secondary ? secondaryFontSize + 18 : 0;
  const blockStartY = Math.round((720 - totalHookHeight - subHeight) / 2);

  lines.forEach((line, i) => {
    const y = blockStartY + i * (fontSize + lineSpacing);
    filters.push(
      `drawtext=${ff}fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black@0.8:x=48:y=${y}:text='${escapeDrawtext(line)}'`
    );
  });

  if (secondary) {
    const subY = blockStartY + totalHookHeight + 18;
    filters.push(
      `drawtext=${ff}fontsize=${secondaryFontSize}:fontcolor=0x${accent}:borderw=3:bordercolor=black@0.85:x=48:y=${subY}:text='${escapeDrawtext(secondary)}'`
    );
  }

  const hasLogo = options.logoBuffer && options.logoBuffer.length > 0;
  let logoPath: string | null = null;
  if (hasLogo) {
    logoPath = path.join(tempDir, 'logo.png');
    await fs.writeFile(logoPath, options.logoBuffer!);
  }

  try {
    if (hasLogo && logoPath) {
      const args = [
        '-i', bgPath,
        '-i', logoPath,
        '-filter_complex',
        `[0]${filters.join(',')}[base];[1]scale=140:-1[logo];[base][logo]overlay=W-w-32:H-h-32`,
        '-frames:v', '1',
        '-y',
        outPath,
      ];
      await runFFmpeg(ffmpegPath, args);
    } else {
      const args = [
        '-i', bgPath,
        '-vf', filters.join(','),
        '-frames:v', '1',
        '-y',
        outPath,
      ];
      await runFFmpeg(ffmpegPath, args);
    }

    const buf = await fs.readFile(outPath);

    if (buf.length > 2 * 1024 * 1024) {
      const jpgPath = path.join(tempDir, 'thumb.jpg');
      await runFFmpeg(ffmpegPath, ['-i', outPath, '-q:v', '3', '-y', jpgPath]);
      const jpgBuf = await fs.readFile(jpgPath);
      return jpgBuf;
    }

    return buf;
  } finally {
    try { await fs.rm(tempDir, { recursive: true }); } catch {}
  }
}

/**
 * Compose up to N thumbnail variants using different background images + hook
 * variants. Returns empty array on total failure — caller should fall back to
 * plain background thumbnail.
 */
export async function composeThumbnailVariants(
  backgrounds: Buffer[],
  variants: ThumbnailVariantSpec[],
  shared: {
    brand?: string;
    logoBuffer?: Buffer;
    /** Song title burned in below the hook on every variant. */
    titleText?: string;
  } = {}
): Promise<Buffer[]> {
  const count = Math.min(backgrounds.length, variants.length);
  if (count === 0) return [];

  const results: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const buf = await composeThumbnail({
        backgroundBuffer: backgrounds[i],
        hook: variants[i].hook,
        subtext: variants[i].subtext,
        titleText: shared.titleText,
        accentColor: variants[i].accentColor || pickAccent(i),
        stamp: variants[i].stamp,
        brand: shared.brand,
        logoBuffer: shared.logoBuffer,
      });
      results.push(buf);
      console.log(`[ThumbnailComposer] Variant ${i + 1}/${count} composed (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`[ThumbnailComposer] Variant ${i + 1} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return results;
}

export async function isAvailable(): Promise<boolean> {
  try {
    await ensureFFmpeg();
    return true;
  } catch {
    return false;
  }
}

export { ensureFFmpeg } from './ffmpeg-renderer';
