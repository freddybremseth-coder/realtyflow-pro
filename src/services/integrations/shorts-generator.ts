/**
 * Shorts generator — turns a full-length music video into a viral-optimized
 * YouTube Short (9:16, 30-45 s) with:
 *   - **Drop detection:** scans audio RMS in 3-second windows and starts the
 *     Short a few seconds before the loudest window so the hook lands early.
 *   - **Burned hook text:** 2-3 s of large caps text + a footer "FULL VERSION
 *     IN DESCRIPTION" prompt at the end.
 *   - **Loopable cross-fade:** blends the last 0.5 s back into the first
 *     0.5 s (audio + video) so the Short re-plays seamlessly — YouTube Shorts
 *     algorithm rewards full watch-through loops.
 *
 * Returns an MP4 buffer ready for upload.
 */

import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ensureFFmpeg, ensureFont } from './ffmpeg-renderer';

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────

export interface ShortsOptions {
  /** Full-length video buffer (any aspect). */
  videoBuffer: Buffer;
  /** Target duration in seconds. Clamped to 30-60. Default 35. */
  targetDuration?: number;
  /** Burned caps-text hook, shown first 2.5 s. Empty string skips it. */
  hook?: string;
  /** Optional footer shown last 3 s (e.g. "FULL VERSION IN DESC 👇"). */
  endCard?: string;
  /** Accent color for hook backing bar (hex, no leading #). */
  accentColor?: string;
  /** Seconds of loop cross-fade. Default 0.5, clamped 0.3-1.0. */
  loopFade?: number;
}

export interface ShortsResult {
  videoBuffer: Buffer;
  durationSeconds: number;
  dropStartSeconds: number;
  detectionMethod: 'drop-detect' | 'heuristic-30pct' | 'fallback-start';
}

// ─── FFmpeg helpers ─────────────────────────────────────────

function runFFmpeg(ffmpegPath: string, args: string[], timeoutMs = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error(`FFmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 50_000) stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stderr);
      else {
        const tail = stderr.split('\n').filter((l) => l.trim()).slice(-6).join('\n');
        reject(new Error(`Shorts FFmpeg exit ${code}:\n${tail}`));
      }
    });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

async function probeDuration(ffmpegPath: string, videoPath: string): Promise<number> {
  let stderr = '';
  try {
    const result = await execFileAsync(ffmpegPath, ['-i', videoPath, '-hide_banner', '-f', 'null', '-']);
    stderr = result.stderr || '';
  } catch (err: any) {
    stderr = err.stderr || '';
  }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
}

// ─── Drop detection ─────────────────────────────────────────

/**
 * Find the loudest ~3-second chunk in the audio track. Returns the start
 * time of that chunk in seconds, or null if detection fails.
 *
 * Strategy: run `astats=reset=3` which resets stats every 3 s, emit RMS
 * levels as metadata, parse them and pick the argmax. Cheap — single pass,
 * no full decode to disk.
 */
async function detectDropSecond(ffmpegPath: string, videoPath: string): Promise<number | null> {
  let stderr = '';
  try {
    const result = await execFileAsync(
      ffmpegPath,
      [
        '-i', videoPath,
        '-vn',
        '-af', 'astats=metadata=1:reset=3,ametadata=print:key=lavfi.astats.Overall.RMS_level',
        '-f', 'null', '-',
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    stderr = result.stderr || '';
  } catch (err: any) {
    stderr = err.stderr || '';
  }

  if (!stderr) return null;

  // Lines look like:
  //   frame:0    pts:0       pts_time:0
  //   lavfi.astats.Overall.RMS_level=-12.345
  const blocks = stderr.split(/frame:\d+/);
  const windows: Array<{ t: number; rms: number }> = [];
  for (const block of blocks) {
    const tMatch = block.match(/pts_time:(\d+(?:\.\d+)?)/);
    const rMatch = block.match(/RMS_level=(-?\d+(?:\.\d+)?)/);
    if (tMatch && rMatch) {
      const rms = parseFloat(rMatch[1]);
      if (Number.isFinite(rms) && rms > -100) {
        windows.push({ t: parseFloat(tMatch[1]), rms });
      }
    }
  }

  if (windows.length < 3) return null;

  // Avoid picking the last 10 s — the drop should have room for a 30 s clip.
  const maxT = Math.max(...windows.map((w) => w.t));
  const usable = windows.filter((w) => w.t < maxT - 10);
  if (usable.length === 0) return null;

  usable.sort((a, b) => b.rms - a.rms);
  return usable[0].t;
}

// ─── Main ───────────────────────────────────────────────────

export async function generateShort(options: ShortsOptions): Promise<ShortsResult> {
  const ffmpegPath = await ensureFFmpeg();
  const fontPath = await ensureFont();
  const ff = fontPath ? `fontfile='${fontPath.replace(/'/g, "\\'")}'\\:` : '';

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neural-short-'));
  const inputPath = path.join(workDir, 'input.mp4');
  const clipPath = path.join(workDir, 'clip.mp4');
  const headPath = path.join(workDir, 'head.mp4');
  const tailPath = path.join(workDir, 'tail.mp4');
  const finalPath = path.join(workDir, 'short.mp4');

  await fs.writeFile(inputPath, options.videoBuffer);

  try {
    const duration = await probeDuration(ffmpegPath, inputPath);
    if (duration < 15) {
      throw new Error(`Input video too short: ${duration.toFixed(1)}s (need ≥15s)`);
    }

    const targetDur = Math.min(60, Math.max(30, options.targetDuration || 35));
    const loopFade = Math.min(1.0, Math.max(0.3, options.loopFade ?? 0.5));
    const accent = options.accentColor || 'ff3366';

    // ── 1. Decide start time ──
    let detectionMethod: ShortsResult['detectionMethod'] = 'fallback-start';
    let dropSecond: number | null = null;

    if (duration > targetDur + 6) {
      try {
        dropSecond = await detectDropSecond(ffmpegPath, inputPath);
        if (dropSecond !== null) detectionMethod = 'drop-detect';
      } catch (err) {
        console.warn('[ShortsGen] Drop detection failed, falling back to heuristic:', err instanceof Error ? err.message : err);
      }
    }

    let startTime: number;
    if (dropSecond !== null) {
      // Start 3 s before the drop so the buildup → drop lands in first 3-6 s.
      startTime = Math.max(0, dropSecond - 3);
    } else if (duration > targetDur + 6) {
      // Heuristic: 30 % into the track
      startTime = Math.max(0, duration * 0.3);
      detectionMethod = 'heuristic-30pct';
    } else {
      startTime = 0;
    }

    // Ensure we don't run past the end
    startTime = Math.min(startTime, Math.max(0, duration - targetDur - loopFade));

    // ── 2. Crop to vertical 9:16 + apply hook overlay ──
    // The hook fades in at 0.3 s and out at 2.8 s. The end card (if present)
    // fades in at targetDur-3 and out at targetDur-0.2.
    const filters: string[] = [
      `crop=ih*9/16:ih:(iw-ih*9/16)/2:0`,
      `scale=1080:1920`,
    ];

    if (options.hook) {
      const hook = options.hook.toUpperCase();
      const fontSize = hook.length > 14 ? 100 : hook.length > 8 ? 140 : 180;
      filters.push(
        `drawbox=x=0:y=250:w=iw:h=${fontSize + 80}:color=black@0.55:t=fill:enable='between(t,0.2,2.9)'`,
        `drawtext=${ff}fontsize=${fontSize}:fontcolor=white:borderw=6:bordercolor=0x${accent}@0.95:x=(w-text_w)/2:y=h/2-450:text='${escapeDrawtext(hook)}':enable='between(t,0.3,2.8)'`,
      );
    }

    if (options.endCard) {
      const ecStart = targetDur - 3;
      const ecEnd = targetDur - 0.2;
      filters.push(
        `drawbox=x=0:y=h-260:w=iw:h=140:color=0x${accent}@0.92:t=fill:enable='between(t,${ecStart.toFixed(2)},${ecEnd.toFixed(2)})'`,
        `drawtext=${ff}fontsize=58:fontcolor=white:x=(w-text_w)/2:y=h-220:text='${escapeDrawtext(options.endCard.toUpperCase())}':enable='between(t,${(ecStart + 0.1).toFixed(2)},${ecEnd.toFixed(2)})'`,
      );
    }

    await runFFmpeg(ffmpegPath, [
      '-ss', startTime.toFixed(2),
      '-i', inputPath,
      '-t', targetDur.toFixed(2),
      '-vf', filters.join(','),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      clipPath,
    ]);

    // ── 3. Loopable cross-fade ──
    // Split the clip into HEAD (0 → dur-fade) and TAIL (last `fade` s overlaps
    // with first `fade` s of the clip). Then xfade/acrossfade between HEAD
    // end and clip start so the last `fade` s seamlessly transitions into
    // the beginning — the viewer can loop without seeing a cut.
    const clipDur = targetDur;
    const headDur = clipDur - loopFade;

    // HEAD = [0, headDur]
    await runFFmpeg(ffmpegPath, [
      '-i', clipPath,
      '-t', headDur.toFixed(2),
      '-c', 'copy',
      '-y',
      headPath,
    ]);

    // TAIL = [0, loopFade] — the "return to start" clip we cross-fade into
    await runFFmpeg(ffmpegPath, [
      '-i', clipPath,
      '-t', loopFade.toFixed(2),
      '-c', 'copy',
      '-y',
      tailPath,
    ]);

    // Final: head + xfade into tail at end
    const xfadeOffset = Math.max(0, headDur - loopFade);
    await runFFmpeg(ffmpegPath, [
      '-i', headPath,
      '-i', tailPath,
      '-filter_complex',
      `[0:v][1:v]xfade=transition=fade:duration=${loopFade.toFixed(2)}:offset=${xfadeOffset.toFixed(2)}[vout];` +
      `[0:a][1:a]acrossfade=d=${loopFade.toFixed(2)}:c1=tri:c2=tri[aout]`,
      '-map', '[vout]',
      '-map', '[aout]',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      finalPath,
    ]);

    const videoBuffer = await fs.readFile(finalPath);
    const finalDuration = await probeDuration(ffmpegPath, finalPath);

    console.log(
      `[ShortsGen] Short built: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ` +
      `${finalDuration.toFixed(1)}s, start=${startTime.toFixed(1)}s (${detectionMethod})`,
    );

    return {
      videoBuffer,
      durationSeconds: finalDuration,
      dropStartSeconds: startTime,
      detectionMethod,
    };
  } finally {
    try { await fs.rm(workDir, { recursive: true }); } catch {}
  }
}

/**
 * Build a Shorts title that skews toward virality. Tries to:
 *   - Stay under 45 chars so it doesn't truncate
 *   - Lead with a hook (POV, question, cliffhanger)
 *   - Keep #Shorts at the end
 */
export function buildShortsTitle(opts: {
  title: string;
  genre: string;
  mood: string;
  hook?: string;
}): string {
  const core = opts.hook?.trim() || opts.title;
  const formulas = [
    `POV: ${opts.mood} ${opts.genre} at 3AM 😵‍💫 #Shorts`,
    `When the ${opts.genre} drop hits... 🔥 #Shorts`,
    `${core} goes HARD 🎧 #Shorts`,
    `Don't skip this ${opts.genre} 🎵 #Shorts`,
    `${core} | ${opts.mood} ${opts.genre} #Shorts`,
  ];
  const pick = formulas[Math.floor(Math.random() * formulas.length)];
  return pick.length > 100 ? pick.slice(0, 97) + '...' : pick;
}
