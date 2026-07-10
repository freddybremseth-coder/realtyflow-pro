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
  /** Song title shown persistently in the lower third. */
  titleText?: string;
  /** Optional logo overlaid top-right for the whole Short. */
  logoBuffer?: Buffer;
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
  // Header-only probe: `ffmpeg -i` without an output exits non-zero but
  // prints the Duration line instantly. Never decode the file here — a full
  // `-f null` decode of a multi-minute video can burn a minute of the
  // serverless time budget on its own.
  let stderr = '';
  try {
    const result = await execFileAsync(ffmpegPath, ['-hide_banner', '-i', videoPath]);
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
 * Find the start of the loudest sustained section (~12 s) in the audio
 * track — for most tracks that's the chorus/drop. Returns the start time in
 * seconds, or null if detection fails.
 *
 * Strategy: run `astats=reset=3` which resets stats every 3 s, emit RMS
 * levels as metadata, then pick the 4-window stretch (12 s) with the highest
 * average loudness. Averaging favors the chorus over a single loud hit
 * (cymbal crash, FX sweep). Cheap — single audio-only pass.
 */
async function getLoudnessSeries(
  ffmpegPath: string,
  mediaPath: string,
): Promise<Array<{ t: number; rms: number }>> {
  let stderr = '';
  try {
    const result = await execFileAsync(
      ffmpegPath,
      [
        '-i', mediaPath,
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

  if (!stderr) return [];

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

  // The filter emits one (cumulative) RMS value per audio frame; the value
  // just before each 3 s reset is the RMS of that whole window. Group frames
  // into 3 s buckets and keep the final value per bucket.
  const buckets = new Map<number, { t: number; rms: number }>();
  for (const w of windows) {
    const idx = Math.floor(w.t / 3);
    const existing = buckets.get(idx);
    if (!existing || w.t > existing.t) buckets.set(idx, { t: idx * 3, rms: w.rms });
  }
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t);
}

/**
 * Rank sustained ~12 s sections by average loudness. Returns the start times
 * of the best non-overlapping candidates (chorus, second chorus, big
 * build-ups...), loudest first.
 */
function rankSections(
  series: Array<{ t: number; rms: number }>,
  minGapSeconds = 25,
): number[] {
  if (series.length < 3) return [];

  // Avoid picking the last 10 s — a section should have room for a 30 s clip.
  const maxT = series[series.length - 1].t;
  const usable = series.filter((w) => w.t < maxT - 10);
  if (usable.length === 0) return [];

  const span = Math.min(4, usable.length);
  const candidates: Array<{ t: number; avg: number }> = [];
  for (let i = 0; i + span <= usable.length; i++) {
    const avg = usable.slice(i, i + span).reduce((sum, w) => sum + w.rms, 0) / span;
    candidates.push({ t: usable[i].t, avg });
  }
  candidates.sort((a, b) => b.avg - a.avg);

  const picked: number[] = [];
  for (const c of candidates) {
    if (picked.every((p) => Math.abs(p - c.t) >= minGapSeconds)) picked.push(c.t);
    if (picked.length >= 5) break;
  }
  return picked;
}

async function detectDropSecond(ffmpegPath: string, videoPath: string): Promise<number | null> {
  const series = await getLoudnessSeries(ffmpegPath, videoPath);
  const ranked = rankSections(series);
  return ranked.length > 0 ? ranked[0] : null;
}

/**
 * Rank the best sustained sections of an audio/video file, loudest first.
 * Used by the follow-up Shorts cron to pick a DIFFERENT section than the
 * original Short. `excludeNear` filters out starts within 25 s of already
 * used sections.
 */
export async function detectTopSections(
  mediaBuffer: Buffer,
  excludeNear: number[] = [],
): Promise<number[]> {
  const ffmpegPath = await ensureFFmpeg();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-sections-'));
  const mediaPath = path.join(workDir, 'media.bin');
  try {
    await fs.writeFile(mediaPath, mediaBuffer);
    const series = await getLoudnessSeries(ffmpegPath, mediaPath);
    return rankSections(series).filter((t) =>
      excludeNear.every((used) => Math.abs(used - t) >= 25),
    );
  } finally {
    try { await fs.rm(workDir, { recursive: true }); } catch {}
  }
}

// ─── Shared overlay filters (hook + title + end card) ───────

function buildOverlayFilters(opts: {
  ff: string;
  accent: string;
  targetDur: number;
  hook?: string;
  titleText?: string;
  endCard?: string;
}): string[] {
  const { ff, accent, targetDur } = opts;
  const filters: string[] = [];

  if (opts.hook) {
    const hook = opts.hook.toUpperCase();
    const fontSize = hook.length > 14 ? 90 : hook.length > 10 ? 110 : hook.length > 8 ? 140 : 180;
    // Backing bar aligned with the text (text sits at ih/2-450).
    filters.push(
      `drawbox=x=0:y=ih/2-490:w=iw:h=${fontSize + 80}:color=black@0.55:t=fill:enable='between(t,0.2,2.9)'`,
      `drawtext=${ff}fontsize=${fontSize}:fontcolor=white:borderw=6:bordercolor=0x${accent}@0.95:x=(w-text_w)/2:y=h/2-450:text='${escapeDrawtext(hook)}':enable='between(t,0.3,2.8)'`,
    );
  }

  if (opts.titleText) {
    // Persistent song title in the lower third — truncated so it never
    // runs off the 1080 px frame.
    const rawTitle = opts.titleText.trim();
    const title = rawTitle.length > 30 ? `${rawTitle.slice(0, 29).trimEnd()}…` : rawTitle;
    const titleFontSize = title.length > 22 ? 44 : 54;
    filters.push(
      `drawtext=${ff}fontsize=${titleFontSize}:fontcolor=white:borderw=4:bordercolor=black@0.85:x=(w-text_w)/2:y=h-380:text='${escapeDrawtext(title)}'`,
      `drawtext=${ff}fontsize=34:fontcolor=0x${accent}:borderw=3:bordercolor=black@0.85:x=(w-text_w)/2:y=h-310:text='RE-MASTER FREDDY'`,
    );
  }

  if (opts.endCard) {
    const ecStart = targetDur - 3;
    const ecEnd = targetDur - 0.2;
    filters.push(
      `drawbox=x=0:y=h-260:w=iw:h=140:color=0x${accent}@0.92:t=fill:enable='between(t,${ecStart.toFixed(2)},${ecEnd.toFixed(2)})'`,
      `drawtext=${ff}fontsize=58:fontcolor=white:x=(w-text_w)/2:y=h-220:text='${escapeDrawtext(opts.endCard.toUpperCase())}':enable='between(t,${(ecStart + 0.1).toFixed(2)},${ecEnd.toFixed(2)})'`,
    );
  }

  return filters;
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
      ...buildOverlayFilters({
        ff,
        accent,
        targetDur,
        hook: options.hook,
        titleText: options.titleText,
        endCard: options.endCard,
      }),
    ];

    // Optional logo overlay (top-right, whole duration) — needs a second
    // input, so the filter list becomes a filter_complex graph.
    const hasLogo = options.logoBuffer && options.logoBuffer.length > 0;
    let logoPath: string | null = null;
    if (hasLogo) {
      logoPath = path.join(workDir, 'logo.png');
      await fs.writeFile(logoPath, options.logoBuffer!);
    }

    const clipArgs = hasLogo && logoPath
      ? [
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-i', logoPath,
          '-t', targetDur.toFixed(2),
          '-filter_complex',
          `[0:v]${filters.join(',')}[base];[1:v]scale=170:-1[logo];[base][logo]overlay=W-w-36:110[vout]`,
          '-map', '[vout]',
          '-map', '0:a',
        ]
      : [
          '-ss', startTime.toFixed(2),
          '-i', inputPath,
          '-t', targetDur.toFixed(2),
          '-vf', filters.join(','),
        ];

    await runFFmpeg(ffmpegPath, [
      ...clipArgs,
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

// ─── Shorts from audio + still images ────────────────────────

export interface AudioShortsOptions {
  /** Full song audio (MP3/AAC buffer). */
  audioBuffer: Buffer;
  /** 2-6 background images (any aspect — cover-cropped to 9:16). */
  imageBuffers: Buffer[];
  /** Where in the song the clip starts (seconds). */
  startTime: number;
  /** Target duration in seconds. Clamped to 30-60. Default 35. */
  targetDuration?: number;
  hook?: string;
  titleText?: string;
  endCard?: string;
  accentColor?: string;
  logoBuffer?: Buffer;
}

/**
 * Render a vertical Short directly from the song audio + still images —
 * used by the follow-up Shorts cron, where the original rendered video is
 * no longer available (only YouTube has it). Images are shown as a static
 * slideshow (no Ken Burns, per channel style) with the same hook/title/logo
 * branding as pipeline Shorts.
 */
export async function generateShortFromAudio(
  options: AudioShortsOptions,
): Promise<{ videoBuffer: Buffer; durationSeconds: number }> {
  if (options.imageBuffers.length === 0) throw new Error('No images provided');

  const ffmpegPath = await ensureFFmpeg();
  const fontPath = await ensureFont();
  const ff = fontPath ? `fontfile='${fontPath.replace(/'/g, "\\'")}'\\:` : '';

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-audioshort-'));
  const audioPath = path.join(workDir, 'audio.mp3');
  const listPath = path.join(workDir, 'list.txt');
  const outPath = path.join(workDir, 'short.mp4');

  try {
    await fs.writeFile(audioPath, options.audioBuffer);

    const targetDur = Math.min(60, Math.max(30, options.targetDuration || 35));
    const accent = options.accentColor || 'ff3366';

    // Clamp start so the clip never runs past the end of the song.
    const audioDur = await probeDuration(ffmpegPath, audioPath);
    const startTime = audioDur > 0
      ? Math.max(0, Math.min(options.startTime, audioDur - targetDur))
      : Math.max(0, options.startTime);

    // Image slideshow via the concat demuxer — one image per equal segment.
    const images = options.imageBuffers.slice(0, 6);
    const segDur = targetDur / images.length;
    const listLines: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const imgPath = path.join(workDir, `img-${i}.png`);
      await fs.writeFile(imgPath, images[i]);
      listLines.push(`file '${imgPath}'`, `duration ${segDur.toFixed(3)}`);
    }
    // Concat demuxer quirk: the last file must be repeated (without duration)
    // or the final segment is dropped.
    listLines.push(`file '${path.join(workDir, `img-${images.length - 1}.png`)}'`);
    await fs.writeFile(listPath, listLines.join('\n'), 'utf-8');

    const filters = [
      `scale=1080:1920:force_original_aspect_ratio=increase`,
      `crop=1080:1920`,
      `fps=12`,
      `format=yuv420p`,
      ...buildOverlayFilters({
        ff,
        accent,
        targetDur,
        hook: options.hook,
        titleText: options.titleText,
        endCard: options.endCard,
      }),
    ];

    const hasLogo = options.logoBuffer && options.logoBuffer.length > 0;
    let logoPath: string | null = null;
    if (hasLogo) {
      logoPath = path.join(workDir, 'logo.png');
      await fs.writeFile(logoPath, options.logoBuffer!);
    }

    const inputArgs = [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-ss', startTime.toFixed(2), '-i', audioPath,
      ...(hasLogo && logoPath ? ['-i', logoPath] : []),
    ];
    const filterArgs = hasLogo && logoPath
      ? [
          '-filter_complex',
          `[0:v]${filters.join(',')}[base];[2:v]scale=170:-1[logo];[base][logo]overlay=W-w-36:110[vout]`,
          '-map', '[vout]',
          '-map', '1:a',
        ]
      : ['-map', '0:v', '-map', '1:a', '-vf', filters.join(',')];

    await runFFmpeg(ffmpegPath, [
      ...inputArgs,
      ...filterArgs,
      '-t', targetDur.toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outPath,
    ]);

    const videoBuffer = await fs.readFile(outPath);
    const durationSeconds = await probeDuration(ffmpegPath, outPath);
    console.log(
      `[ShortsGen] Audio-short built: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ` +
      `${durationSeconds.toFixed(1)}s, start=${startTime.toFixed(1)}s, ${images.length} images`,
    );
    return { videoBuffer, durationSeconds };
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
  // Always include the actual song title so viewers can find the full track.
  const formulas = [
    `${opts.title} 🔥 ${opts.mood} ${opts.genre} #Shorts`,
    `${opts.title} — when the drop hits 🎧 #Shorts`,
    `Don't skip: ${opts.title} 🎵 ${opts.genre} #Shorts`,
    `${opts.title} | Re-Master Freddy #Shorts`,
    `POV: ${opts.title} at 3AM 😵‍💫 #Shorts`,
  ];
  const pick = formulas[Math.floor(Math.random() * formulas.length)];
  return pick.length > 100 ? pick.slice(0, 97) + '...' : pick;
}
