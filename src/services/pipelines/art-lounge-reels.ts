/**
 * Re-Master -> RealtyFlow Art Lounge handoff. Only public, published gallery
 * PREVIEWS are ever rendered; original sale masters remain private.
 * One deterministic, uncropped, 27-second 9:16 Reel per Madrid calendar day.
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { ensureFFmpeg } from '@/services/integrations/ffmpeg-renderer';
import { buildArtShortPoster } from '@/services/integrations/art-thumbnail-panel';
import { loadPublishedMixArt, type PromotionItem } from '@/services/pipelines/remaster-mix-promotions';
import { isApprovedArtPreviewUrl } from '@/services/pipelines/remaster-mix-art-thumbnail';

export const REEL_SECONDS = 27;
const AUDIO_PREFIX = 'https://ereapsfcsqtdmzosgnnn.supabase.co/storage/v1/object/public/assets/neural-beat/';
export const REEL_BUCKET = 'art-lounge-reels';

export type ReelSong = { id: string; name: string; file_url: string; youtube_url: string };
export type ReelSelection = { song: ReelSong; artwork: PromotionItem[] };

function stableHash(value: string): number {
  let h = 2166136261;
  for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function selectReelAssets(
  day: string, songs: ReelSong[], art: PromotionItem[], recentlyUsedSongs: string[] = [],
): ReelSelection {
  const previous = new Set(recentlyUsedSongs);
  // Historical Re-Master songs can reference external/legacy audio sources.
  // Select only canonical public Re-Master uploads before reserving the daily job.
  const supported = songs.filter(s => s.file_url.startsWith(AUDIO_PREFIX) &&
    s.youtube_url.startsWith('https://www.youtube.com/'));
  const availableSongs = supported.filter(s => !previous.has(s.id));
  const candidates = availableSongs.length ? availableSongs : supported;
  if (!candidates.length || art.length < 3) throw new Error('ART_LOUNGE_SOURCE_UNAVAILABLE');
  const song = [...candidates].sort((a,b) => stableHash(day + a.id) - stableHash(day + b.id))[0];
  const ordered = [...art].sort((a,b) => stableHash(day + song.id + a.id) - stableHash(day + song.id + b.id));
  const selection: PromotionItem[] = [];
  const usedStyles = new Set<string>();
  for (const item of ordered) {
    if (selection.length === 3) break;
    if (usedStyles.has(item.style || '') && art.some(x => !usedStyles.has(x.style || '') && !selection.includes(x))) continue;
    selection.push(item);
    usedStyles.add(item.style || '');
  }
  for (const item of ordered) if (selection.length < 3 && !selection.some(x => x.id === item.id)) selection.push(item);
  if (selection.length !== 3 || new Set(selection.map(x => x.id)).size !== 3)
    throw new Error('ART_LOUNGE_DUPLICATE_VISUALS');
  return { song, artwork: selection };
}

export function reelCaption(selection: ReelSelection): string {
  const title = selection.song.name.replace(/[\r\n]+/g, ' ').trim().slice(0, 90);
  const artCredits = selection.artwork.map(x => x.title.replace(/[\r\n]+/g,' ').trim().slice(0,100)).join(' · ');
  const links = selection.artwork.map(x => x.detailUrl).join('\n');
  return [
    'Art Lounge | Freddy Bremseth Art',
    'Original art: ' + artCredits,
    'Music: ' + title + ' — Re-Master Freddy',
    'Explore the artworks:\n' + links,
    'Art gallery: https://art.freddybremseth.com',
    'Listen: ' + selection.song.youtube_url,
    '#FreddyBremsethArt #ReMasterFreddy #ArtLounge #OriginalArt',
  ].join('\n\n');
}

export async function fetchApprovedReelSource(url: string, kind: 'audio' | 'art'): Promise<Buffer> {
  if (kind === 'art' ? !isApprovedArtPreviewUrl(url)
    : !(url.startsWith(AUDIO_PREFIX) && !/%2f|%5c|\.\.|[?#]/i.test(url.substring(AUDIO_PREFIX.length))))
    throw new Error('ART_LOUNGE_UNTRUSTED_SOURCE');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error('ART_LOUNGE_SOURCE_HTTP_' + response.status);
  const max = kind === 'art' ? 8 * 1024 * 1024 : 40 * 1024 * 1024;
  const declared = Number(response.headers.get('content-length') || '0');
  if (declared > max) throw new Error('ART_LOUNGE_SOURCE_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > max) throw new Error('ART_LOUNGE_SOURCE_INVALID');
  return bytes;
}

function runFfmpeg(binary: string, args: string[]): Promise<void> {
  return new Promise((resolve,reject) => {
    const child = spawn(binary, args, { stdio: ['ignore','ignore','pipe'] });
    let stderr = '';
    let ended = false;
    const finish = (error?: Error) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('ART_LOUNGE_RENDER_TIMEOUT'));
    }, 210_000);
    child.stderr.on('data',(chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1500); });
    child.once('error',(error: Error) => finish(error));
    child.once('close',(code: number | null) =>
      code === 0 ? finish() : finish(new Error('ART_LOUNGE_FFMPEG_' + code + ': ' + stderr.slice(-600))));
  });
}

export async function renderArtLoungeReel(selection: ReelSelection): Promise<Buffer> {
  if (selection.artwork.length !== 3 || new Set(selection.artwork.map(x => x.id)).size !== 3)
    throw new Error('ART_LOUNGE_THREE_DISTINCT_WORKS_REQUIRED');
  const [audio, ...images] = await Promise.all([
    fetchApprovedReelSource(selection.song.file_url,'audio'),
    ...selection.artwork.map(x => fetchApprovedReelSource(x.imageUrl,'art')),
  ]);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'art-lounge-reel-'));
  try {
    const audioPath = path.join(dir,'song.mp3');
    const posterPath = path.join(dir,'poster.ppm');
    const outputPath = path.join(dir,'reel.mp4');
    await fs.writeFile(audioPath,audio);
    await fs.writeFile(posterPath,buildArtShortPoster('ART LOUNGE',selection.song.name));
    for (let i=0;i<3;i++) await fs.writeFile(path.join(dir,'art'+i+'.webp'),images[i]);
    const binary = await ensureFFmpeg();
    const args = ['-hide_banner','-loglevel','error'];
    for (let i=0;i<3;i++)
      args.push('-loop','1','-framerate','24','-t','9','-i',path.join(dir,'art'+i+'.webp'));
    args.push('-loop','1','-framerate','24','-i',posterPath,
      '-ss','16','-i',audioPath);
    const filters = [0,1,2].map(i => '['+i+':v]scale=1080:1320:force_original_aspect_ratio=decrease,'+
      'pad=1080:1320:(ow-iw)/2:(oh-ih)/2:color=0x101820,fps=24,trim=duration=9,'+
      'setsar=1,setpts=PTS-STARTPTS[v'+i+']');
    filters.push('[v0][v1][v2]concat=n=3:v=1:a=0[gallery]');
    filters.push('[3:v]format=rgb24[poster];[poster][gallery]overlay=0:160:shortest=1,format=yuv420p[out]');
    args.push('-filter_complex',filters.join(';'),'-map','[out]','-map','4:a:0',
      '-t',String(REEL_SECONDS),'-r','24','-c:v','libx264','-preset','ultrafast',
      '-crf','28','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-b:a','128k',
      '-movflags','+faststart','-y',outputPath);
    await runFfmpeg(binary,args);
    const buffer = await fs.readFile(outputPath);
    if (buffer.length < 20_000 || buffer.length > 60 * 1024 * 1024 ||
        buffer.toString('ascii',4,8) !== 'ftyp') throw new Error('ART_LOUNGE_INVALID_MP4');
    return buffer;
  } finally { await fs.rm(dir,{recursive:true,force:true}).catch(() => undefined); }
}
