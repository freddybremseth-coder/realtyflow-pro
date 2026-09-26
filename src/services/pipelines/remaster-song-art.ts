/**
 * Licensed-to-publish gallery previews for Re-Master Freddy's calm / alternative
 * visual lane. NEVER serve art-originals: those are private sale masters.
 */
import { createClient } from '@supabase/supabase-js';

export type ArtVisualMode = 'meditation' | 'relaxing' | 'alternative' | null;
export type SongArtwork = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  artworkUrl: string;
  width: number | null;
  height: number | null;
};

const PREVIEW_PATH = /^[a-z0-9][a-z0-9-]{0,120}\/view\.webp$/;
const THUMB_PATH = /^[a-z0-9][a-z0-9-]{0,120}\/thumb\.webp$/;
const CALM_STYLES = new Set(['landscape', 'impressionism', 'art-nouveau', 'symbolic-realism']);
const ALTERNATIVE_STYLES = new Set(['symbolic-realism', 'surrealism', 'conceptual', 'expressionism', 'abstract']);

function normalized(input: unknown): string {
  if (Array.isArray(input)) return input.map(normalized).join(' ');
  return typeof input === 'string' ? input.toLowerCase() : '';
}

export function classifyArtVisualMode(song: {
  title?: string; genre?: string; style?: string; mood?: string;
  metadata?: Record<string, unknown> | null;
}, analysis?: { genre?: string; style?: string; mood?: string } | null): ArtVisualMode {
  const source = [
    song.title, song.genre, song.style, song.metadata?.category, song.metadata?.genre,
    song.metadata?.style, song.metadata?.tags, analysis?.genre, analysis?.style,
  ].map(normalized).join(' ');
  // Title intent is authoritative for explicitly calm/healing releases. This
  // prevents stale generic EDM metadata from routing songs such as
  // "Healing Waves of Light" or "Deep Ocean Stillness" into DJ/party visuals.
  if (/\b(meditation|meditative|meditating|mindfulness|meditaci[oó]n|healing|stillness|inner peace|sound bath|breathwork)\b/i.test(source)) return 'meditation';
  if (/\b(relaxing|relaxation|relax|ambient|chillout|chill-out|downtempo|sleep music|spa music|yoga|zen|new age|serenity|serene|tranquil|calm|peaceful|soothing)\b/i.test(source)) return 'relaxing';
  if (/\b(alternative|alternativo|alternativa)\b/i.test(source)) return 'alternative';
  // A calm AI mood is sufficient only for low-energy or unspecified-energy
  // tracks, never for high-energy dance/house music.
  const mood = [song.mood, analysis?.mood].map(normalized).join(' ');
  const energy = normalized(song.metadata?.energy);
  if (!/\b(high|intense|energetic)\b/.test(energy) && /\b(meditative|meditation|relaxing|peaceful|ambient|calm|serene|tranquil|soothing|zen)\b/.test(mood)) {
    return 'relaxing';
  }
  return null;
}

export function classifyMixArtVisualMode(
  songs: Array<{ genre?: string | null; style?: string | null; mood?: string | null }>,
): 'meditation' | 'relaxing' | null {
  if (!songs.length) return null;
  const modes = songs.map(song => classifyArtVisualMode({
    genre: song.genre || undefined,
    style: song.style || undefined,
    mood: song.mood || undefined,
  }));
  const calmModes = modes.filter((mode): mode is 'meditation' | 'relaxing' =>
    mode === 'meditation' || mode === 'relaxing',
  );
  // A calm visual lane should represent the mix, not a single outlier track.
  if (calmModes.length < Math.floor(songs.length / 2) + 1) return null;
  const meditationCount = calmModes.filter(mode => mode === 'meditation').length;
  return meditationCount >= Math.ceil(calmModes.length / 2) ? 'meditation' : 'relaxing';
}

function hash(value: string): number {
  let h = 2166136261;
  for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function selectSongArtworks(
  rows: Array<Record<string, unknown>>,
  songId: string,
  mode: Exclude<ArtVisualMode, null>,
  publicUrl: (path: string) => string,
  count = 8,
): SongArtwork[] {
  const preferred = mode === 'alternative' ? ALTERNATIVE_STYLES : CALM_STYLES;
  const seen = new Set<string>();
  const candidates = rows.filter(row => {
    const id = normalized(row.id);
    const preview = normalized(row.public_preview_path);
    const thumb = normalized(row.public_thumb_path);
    if (row.published !== true || !/^[a-z0-9][a-z0-9-]{0,120}$/.test(id) ||
        !PREVIEW_PATH.test(preview) || !THUMB_PATH.test(thumb) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const scored = candidates.map(row => {
    const style = normalized(row.style_id);
    const collection = normalized(row.collection_id);
    const isCalm = preferred.has(style) || (mode !== 'alternative' && /mediterranean|earth/.test(collection));
    return { row, isCalm, order: hash(songId + ':' + String(row.id)) };
  });
  // Curate imagery by mood first; hash only controls variety within a lane.
  scored.sort((a, b) => Number(b.isCalm) - Number(a.isCalm) || a.order - b.order);
  const selected = scored.filter(item => item.isCalm).slice(0, count);
  return selected.map(({ row }) => ({
    id: String(row.id),
    title: String(row.title_en || row.id),
    imageUrl: publicUrl(String(row.public_preview_path)),
    thumbnailUrl: publicUrl(String(row.public_thumb_path)),
    artworkUrl: `https://art.freddybremseth.com/verk/${encodeURIComponent(String(row.id))}/`,
    width: typeof row.pixel_width === 'number' ? row.pixel_width : null,
    height: typeof row.pixel_height === 'number' ? row.pixel_height : null,
  }));
}

export async function loadSongArtGallery(songId: string, mode: Exclude<ArtVisualMode, null>, count = 8): Promise<SongArtwork[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Art gallery storage is not configured');
  const supabase = createClient(url, key);
  const { data, error } = await supabase.from('art_gallery_works')
    .select('id,title_en,style_id,collection_id,orientation,public_preview_path,public_thumb_path,pixel_width,pixel_height,published')
    .eq('published', true).not('public_preview_path', 'is', null).limit(500);
  if (error) throw new Error('Could not read public art gallery previews: ' + error.message);
  const bucket = supabase.storage.from('art-previews');
  return selectSongArtworks((data || []) as Array<Record<string, unknown>>, songId, mode,
    path => bucket.getPublicUrl(path).data.publicUrl, count);
}

export function artCreditsDescription(songId: string): string {
  return [
    '🎨 Artwork and visual compositions by Freddy Bremseth.',
    'Explore the art: https://art.freddybremseth.com',
    `Artwork featured in this song: https://remaster.freddybremseth.com/gallery/${encodeURIComponent(songId)}`,
    '🎵 Music by Re-Master Freddy: https://remaster.freddybremseth.com',
  ].join('\n');
}
