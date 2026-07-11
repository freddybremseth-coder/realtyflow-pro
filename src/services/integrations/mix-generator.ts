/**
 * Mix generator — builds a long-form (20-30 min) genre mix video from
 * multiple songs + still images. Long-form mixes are what people actually
 * search for in the electronic-music niche ("summer house mix", "chill EDM
 * study mix"), so they pull search traffic that single tracks never see.
 *
 * Single FFmpeg pass:
 *   - audio: N tracks concatenated losslessly via the concat filter
 *   - video: one 16:9 image per track (concat demuxer with durations)
 *   - overlays: persistent brand text + logo, per-track title during
 *     that track's segment
 *
 * Returns the MP4 buffer plus chapter markers for the YouTube description.
 */

import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ensureFFmpeg, ensureFont } from './ffmpeg-renderer';

const execFileAsync = promisify(execFile);

export interface MixTrack {
  title: string;
  audioBuffer: Buffer;
}

export interface MixOptions {
  /** 3-12 tracks, played in order. */
  tracks: MixTrack[];
  /** Background images — cycled if fewer than tracks. */
  imageBuffers: Buffer[];
  logoBuffer?: Buffer;
  /** Accent color for track titles (hex, no leading #). */
  accentColor?: string;
}

export interface MixResult {
  videoBuffer: Buffer;
  durationSeconds: number;
  /** Chapter start (seconds) + title per track — for the description. */
  chapters: Array<{ start: number; title: string }>;
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

function runFFmpeg(ffmpegPath: string, args: string[], timeoutMs = 240_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      reject(new Error(`Mix FFmpeg timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 50_000) stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else {
        const tail = stderr.split('\n').filter((l) => l.trim()).slice(-6).join('\n');
        reject(new Error(`Mix FFmpeg exit ${code}:\n${tail}`));
      }
    });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

async function probeDuration(ffmpegPath: string, mediaPath: string): Promise<number> {
  let stderr = '';
  try {
    const result = await execFileAsync(ffmpegPath, ['-hide_banner', '-i', mediaPath]);
    stderr = result.stderr || '';
  } catch (err: any) {
    stderr = err.stderr || '';
  }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
}

export async function generateMix(options: MixOptions): Promise<MixResult> {
  if (options.tracks.length < 2) throw new Error('A mix needs at least 2 tracks');
  if (options.imageBuffers.length === 0) throw new Error('No images provided');

  const ffmpegPath = await ensureFFmpeg();
  const fontPath = await ensureFont();
  const ff = fontPath ? `fontfile='${fontPath.replace(/'/g, "\\'")}'\\:` : '';
  const accent = options.accentColor || '66e5ff';

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-mix-'));
  const listPath = path.join(workDir, 'images.txt');
  const outPath = path.join(workDir, 'mix.mp4');

  try {
    // ── Write audio tracks + probe durations ──
    const trackPaths: string[] = [];
    const durations: number[] = [];
    for (let i = 0; i < options.tracks.length; i++) {
      const p = path.join(workDir, `track-${i}.mp3`);
      await fs.writeFile(p, options.tracks[i].audioBuffer);
      trackPaths.push(p);
      const dur = await probeDuration(ffmpegPath, p);
      if (dur < 10) throw new Error(`Track ${i} ("${options.tracks[i].title}") is too short or unreadable`);
      durations.push(dur);
    }

    // ── Chapters (cumulative starts) ──
    const chapters: Array<{ start: number; title: string }> = [];
    let cursor = 0;
    for (let i = 0; i < options.tracks.length; i++) {
      chapters.push({ start: cursor, title: options.tracks[i].title });
      cursor += durations[i];
    }
    const totalDur = cursor;

    // ── Image slideshow: one image per track, matching its duration ──
    const listLines: string[] = [];
    for (let i = 0; i < options.tracks.length; i++) {
      const imgSrc = options.imageBuffers[i % options.imageBuffers.length];
      const imgPath = path.join(workDir, `img-${i}.png`);
      await fs.writeFile(imgPath, imgSrc);
      listLines.push(`file '${imgPath}'`, `duration ${durations[i].toFixed(3)}`);
    }
    listLines.push(`file '${path.join(workDir, `img-${(options.tracks.length - 1) % options.imageBuffers.length}.png`)}'`);
    await fs.writeFile(listPath, listLines.join('\n'), 'utf-8');

    // ── Video filters: 720p 16:9, low fps (static images), overlays ──
    const filters: string[] = [
      'scale=1280:720:force_original_aspect_ratio=increase',
      'crop=1280:720',
      'fps=2',
      'format=yuv420p',
      // Brand top-left, persistent.
      `drawtext=${ff}fontsize=26:fontcolor=white@0.85:borderw=2:bordercolor=black@0.7:x=32:y=30:text='RE-MASTER FREDDY MIX'`,
    ];

    // Per-track title, bottom-left during that track's segment.
    for (let i = 0; i < chapters.length; i++) {
      const start = chapters[i].start;
      const end = start + durations[i];
      const title = chapters[i].title.length > 45
        ? `${chapters[i].title.slice(0, 44).trimEnd()}…`
        : chapters[i].title;
      filters.push(
        `drawtext=${ff}fontsize=34:fontcolor=0x${accent}:borderw=3:bordercolor=black@0.85:x=32:y=h-70:text='${escapeDrawtext(`${i + 1}. ${title}`)}':enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`,
      );
    }

    // ── Audio: robust N-way concat via the concat filter (re-encodes) ──
    const audioInputs = trackPaths.flatMap((p) => ['-i', p]);
    const audioConcatInputs = trackPaths.map((_, i) => `[${i + 1}:a]`).join('');

    const hasLogo = options.logoBuffer && options.logoBuffer.length > 0;
    let logoPath: string | null = null;
    if (hasLogo) {
      logoPath = path.join(workDir, 'logo.png');
      await fs.writeFile(logoPath, options.logoBuffer!);
    }

    const videoChain = `[0:v]${filters.join(',')}`;
    const filterComplex = hasLogo && logoPath
      ? `${videoChain}[base];[${trackPaths.length + 1}:v]scale=150:-1[logo];[base][logo]overlay=W-w-30:26[vout];${audioConcatInputs}concat=n=${trackPaths.length}:v=0:a=1[aout]`
      : `${videoChain}[vout];${audioConcatInputs}concat=n=${trackPaths.length}:v=0:a=1[aout]`;

    await runFFmpeg(ffmpegPath, [
      '-f', 'concat', '-safe', '0', '-i', listPath,
      ...audioInputs,
      ...(hasLogo && logoPath ? ['-i', logoPath] : []),
      '-filter_complex', filterComplex,
      '-map', '[vout]',
      '-map', '[aout]',
      '-t', totalDur.toFixed(2),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-movflags', '+faststart',
      '-y',
      outPath,
    ]);

    const videoBuffer = await fs.readFile(outPath);
    const durationSeconds = await probeDuration(ffmpegPath, outPath);
    console.log(
      `[MixGen] Mix built: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ` +
      `${(durationSeconds / 60).toFixed(1)} min, ${options.tracks.length} tracks`,
    );
    return { videoBuffer, durationSeconds, chapters };
  } finally {
    try { await fs.rm(workDir, { recursive: true }); } catch {}
  }
}

/** Format seconds as YouTube chapter timestamp (m:ss or h:mm:ss). */
export function formatChapterTime(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
}
