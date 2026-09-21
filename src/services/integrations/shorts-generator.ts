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
import { ensureFFmpeg } from './ffmpeg-renderer';
import { buildArtShortPoster } from './art-thumbnail-panel';

const execFileAsync = promisify(execFile);

// ─── Types ──────────────────────────────────────────────────

export interface ShortsOptions {
  /** Full-length video buffer (any aspect). */
  videoBuffer: Buffer;
  /** Target duration in seconds. Clamped to 30-60. Default 35. */
  targetDuration?: number;
  /** Bitmap hook in the permanent editorial text band (no FFmpeg drawtext). */
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

// All branding is rendered by buildArtShortPoster in Node, not FFmpeg drawtext.
// The server's ffmpeg-static binary does not include the drawtext filter.

// ─── Main ───────────────────────────────────────────────────

export async function generateShort(options: ShortsOptions): Promise<ShortsResult> {
  const ffmpegPath = await ensureFFmpeg();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neural-short-'));
  const inputPath = path.join(workDir, 'input.mp4');
  const clipPath = path.join(workDir, 'clip.mp4');
  const headPath = path.join(workDir, 'head.mp4');
  const tailPath = path.join(workDir, 'tail.mp4');
  const finalPath = path.join(workDir, 'short.mp4');
  const posterPath = path.join(workDir, 'music-poster.ppm');

  await fs.writeFile(inputPath, options.videoBuffer);

  try {
    const duration = await probeDuration(ffmpegPath, inputPath);
    if (duration < 15) {
      throw new Error(`Input video too short: ${duration.toFixed(1)}s (need ≥15s)`);
    }

    const targetDur = Math.min(60, Math.max(15, options.targetDuration || 35));
    const loopFade = Math.min(1.0, Math.max(0.3, options.loopFade ?? 0.5));
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

    // The deployed ffmpeg-static binary has no drawtext. Compose the
    // persistent brand/title/hook as a bitmap poster and place moving video
    // only in its center window. Ignore optional external logos: the poster
    // already contains permanent Re-Master Freddy branding.
    await fs.writeFile(posterPath, buildArtShortPoster(
      options.hook || 'NEW DROP', options.titleText || 'NEW MUSIC', 'music',
    ));
    const clipArgs = [
      '-ss', startTime.toFixed(2), '-i', inputPath,
      '-loop', '1', '-framerate', '12', '-i', posterPath,
      '-t', targetDur.toFixed(2),
      '-filter_complex',
      '[0:v]crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1320,fps=12,setsar=1[visual];' +
      '[1:v]format=rgb24[poster];[poster][visual]overlay=0:160:shortest=1,format=yuv420p[vout]',
      '-map', '[vout]', '-map', '0:a:0',
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

    // Cross-fade is cosmetic; a branded, valid Short must still be returned
    // if xfade is missing or fails on a particular FFmpeg build.
    let outputPath = clipPath;
    try {
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

      outputPath = finalPath;
    } catch (fadeError) {
      console.warn('[ShortsGen] Cross-fade unavailable; using branded clip:', fadeError instanceof Error ? fadeError.message : fadeError);
    }

    const videoBuffer = await fs.readFile(outputPath);
    const finalDuration = await probeDuration(ffmpegPath, outputPath);

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
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-audioshort-'));
  const audioPath = path.join(workDir, 'audio.mp3');
  const listPath = path.join(workDir, 'list.txt');
  const outPath = path.join(workDir, 'short.mp4');
  const posterPath = path.join(workDir, 'music-poster.ppm');

  try {
    await fs.writeFile(audioPath, options.audioBuffer);

    const targetDur = Math.min(60, Math.max(15, options.targetDuration || 35));
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

    // Reuse the exact same branding as initial Shorts. The concat slideshow
    // is cropped ONLY inside the dedicated media window, never over text.
    await fs.writeFile(posterPath, buildArtShortPoster(
      options.hook || 'NEW DROP', options.titleText || 'NEW MUSIC', 'music',
    ));
    const inputArgs = [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      '-ss', startTime.toFixed(2), '-i', audioPath,
      '-loop', '1', '-framerate', '12', '-i', posterPath,
    ];
    const filterArgs = [
      '-filter_complex',
      '[0:v]scale=1080:1320:force_original_aspect_ratio=increase,crop=1080:1320,fps=12,setsar=1[visual];' +
      '[2:v]format=rgb24[poster];[poster][visual]overlay=0:160:shortest=1,format=yuv420p[vout]',
      '-map', '[vout]', '-map', '1:a:0',
    ];

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

/**
 * Dedicated original-art Shorts renderer.
 *
 * Unlike the standard EDM Short, this uses no drawtext filter (absent from
 * ffmpeg-static), never center-crops paintings, and does not assume a musical
 * drop in ambient/meditation audio. A single approved public gallery preview
 * is shown in full above an editorial panel with brand, track and art credit.
 */
export async function generateArtShortFromAudio(options: {
  audioBuffer: Buffer;
  artworkBuffer: Buffer;
  title: string;
  category: 'meditation' | 'relaxing' | 'alternative';
  startTime?: number;
  targetDuration?: number;
}): Promise<{ videoBuffer: Buffer; durationSeconds: number; startSeconds: number }> {
  if (options.audioBuffer.length < 1024 || options.artworkBuffer.length < 1024) {
    throw new Error('Art Short requires a valid song audio file and public artwork preview');
  }
  const ffmpeg = await ensureFFmpeg();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'remaster-art-short-'));
  try {
    const posterPath = path.join(dir, 'poster.ppm');
    const artPath = path.join(dir, 'painting.webp');
    const audioPath = path.join(dir, 'song.mp3');
    const outputPath = path.join(dir, 'short.mp4');
    await Promise.all([
      fs.writeFile(posterPath, buildArtShortPoster(options.category, options.title)),
      fs.writeFile(artPath, options.artworkBuffer),
      fs.writeFile(audioPath, options.audioBuffer),
    ]);
    const duration = await probeDuration(ffmpeg, audioPath);
    if (duration < 16) throw new Error('Song is too short for a 15-second artwork Short');
    const target = Math.min(45, Math.max(15, options.targetDuration || 35), duration - 0.5);
    const start = Math.max(0, Math.min(options.startTime ?? duration * 0.22, duration - target - 0.25));
    await runFFmpeg(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-loop', '1', '-framerate', '2', '-i', posterPath,
      '-loop', '1', '-framerate', '2', '-i', artPath,
      '-ss', start.toFixed(3), '-i', audioPath,
      '-filter_complex',
      '[0:v]format=rgb24[poster];[1:v]scale=1080:1320:force_original_aspect_ratio=decrease,pad=1080:1320:(ow-iw)/2:(oh-ih)/2:color=0x101820,setsar=1[painting];[poster][painting]overlay=0:160:shortest=1,format=yuv420p[v]',
      '-map', '[v]', '-map', '2:a:0',
      '-t', target.toFixed(3), '-r', '2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '25',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-y', outputPath,
    ], 210_000);
    const videoBuffer = await fs.readFile(outputPath);
    const durationSeconds = await probeDuration(ffmpeg, outputPath);
    if (durationSeconds < 14 || videoBuffer.length < 10_000) {
      throw new Error('Artwork Short render was empty or too short');
    }
    return { videoBuffer, durationSeconds, startSeconds: start };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
