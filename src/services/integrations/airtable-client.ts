/**
 * Song & Genre Image data layer — backed by Supabase.
 *
 * File kept as airtable-client.ts to avoid renaming every import across the codebase.
 * All Airtable-specific logic has been replaced with Supabase queries.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SongRecord, AirtableRecord, AirtableBrandVideoRecord } from '@/lib/types';

// Re-export AirtableSongRecord alias so existing imports still work
export type { SongRecord as AirtableSongRecord } from '@/lib/types';

export const REMASTER_CANONICAL_SONG_BRAND = 'remasterfreddy';
export const REMASTER_CANONICAL_SONG_ARTIST = 'Re-Master Freddy';
export const REMASTER_LEGACY_SONG_BRANDS = ['neural-beat', 'neuralbeat'] as const;
export const REMASTER_SONG_READ_BRANDS = [
  REMASTER_CANONICAL_SONG_BRAND,
  ...REMASTER_LEGACY_SONG_BRANDS,
] as const;

// ─── Supabase client (singleton) ───────────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase not configured (missing URL or key)');
    _supabase = createClient(url, key);
  }
  return _supabase;
}

export function __setSupabaseClientForTests(client: SupabaseClient | null): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__setSupabaseClientForTests is only available in test mode');
  }
  _supabase = client;
}

// ─── Supabase row → SongRecord mapping ─────────────────────────────────

interface SongsRow {
  id: string;
  name: string;
  artist: string | null;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  duration: number | null;
  file_url: string | null;
  status: string | null;
  youtube_url: string | null;
  youtube_channel_id: string | null;
  youtube_video_id: string | null;
  brand: string | null;
  tags: string[] | null;
  steps: any[] | null;
  style: string | null;
  energy: string | null;
  visual_style: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  ai_metadata: Record<string, any> | null;
  error_message: string | null;
  airtable_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSongRecord(row: SongsRow): SongRecord {
  return {
    id: row.id,
    title: row.name || '',
    artist: row.artist || REMASTER_CANONICAL_SONG_ARTIST,
    audioUrl: row.file_url || undefined,
    status: (row.status as SongRecord['status']) || 'ready',
    genre: row.genre || row.ai_metadata?.genre || undefined,
    mood: row.mood || row.ai_metadata?.mood || undefined,
    style: row.style || row.ai_metadata?.style || undefined,
    energy: row.energy || row.ai_metadata?.energy || undefined,
    visualStyle: row.visual_style || undefined,
    bpm: row.bpm || row.ai_metadata?.bpm || undefined,
    imageUrl: row.image_url || undefined,
    thumbnailUrl: row.thumbnail_url || undefined,
    youtubeUrl: row.youtube_url || undefined,
    youtubeVideoId: row.youtube_video_id || undefined,
    errorMessage: row.error_message || undefined,
    metadata: row.ai_metadata || undefined,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

// ─── Song CRUD ──────────────────────────────────────────────────────────

export async function getSongs(maxRecords?: number): Promise<SongRecord[]> {
  const supabase = getSupabase();
  let query = supabase
    .from('songs')
    .select('*')
    .in('brand', [...REMASTER_SONG_READ_BRANDS])
    .order('created_at', { ascending: false });

  if (maxRecords) query = query.limit(maxRecords);

  const { data, error } = await query;
  if (error) throw new Error(`getSongs failed: ${error.message}`);
  return (data || []).map(rowToSongRecord);
}

export async function getSongsWithoutYouTube(): Promise<SongRecord[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .in('brand', [...REMASTER_SONG_READ_BRANDS])
    .is('youtube_url', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`getSongsWithoutYouTube failed: ${error.message}`);
  return (data || []).map(rowToSongRecord);
}

export async function getSongById(id: string): Promise<SongRecord> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('id', id)
    .in('brand', [...REMASTER_SONG_READ_BRANDS])
    .single();

  if (error) throw new Error(`getSongById failed: ${error.message}`);
  return rowToSongRecord(data);
}

export async function createSong(fields: {
  title: string;
  artist?: string;
  audioUrl: string;
}): Promise<SongRecord> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('songs')
    .insert({
      name: fields.title,
      artist: REMASTER_CANONICAL_SONG_ARTIST,
      file_url: fields.audioUrl,
      status: 'ready',
      brand: REMASTER_CANONICAL_SONG_BRAND,
    })
    .select('*')
    .single();

  if (error) throw new Error(`createSong failed: ${error.message}`);
  return rowToSongRecord(data);
}

export async function updateSongStatus(
  songId: string,
  status: string,
  extraFields?: Record<string, any>
): Promise<void> {
  const supabase = getSupabase();
  const update: Record<string, any> = {
    status: status.toLowerCase(),
  };

  if (extraFields) {
    applyFieldMapping(update, extraFields);
  }

  const { error } = await supabase
    .from('songs')
    .update(update)
    .eq('id', songId);

  if (error) throw new Error(`updateSongStatus failed: ${error.message}`);
}

export async function updateSongFields(
  songId: string,
  fields: Record<string, any>
): Promise<void> {
  const supabase = getSupabase();
  const update: Record<string, any> = {};
  applyFieldMapping(update, fields);

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from('songs')
    .update(update)
    .eq('id', songId);

  if (error) throw new Error(`updateSongFields failed: ${error.message}`);
}

export async function clearSongFields(songId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('songs')
    .update({
      youtube_url: null,
      youtube_video_id: null,
      ai_metadata: null,
      image_url: null,
      thumbnail_url: null,
      status: 'ready',
      error_message: null,
      genre: null,
      mood: null,
      style: null,
      energy: null,
      visual_style: null,
    })
    .eq('id', songId);

  if (error) throw new Error(`clearSongFields failed: ${error.message}`);
}

export async function deleteSong(songId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('songs')
    .delete()
    .eq('id', songId);

  if (error) throw new Error(`deleteSong failed: ${error.message}`);
}

// ─── Field mapping (internal keys → Supabase columns) ──────────────────

function applyFieldMapping(target: Record<string, any>, fields: Record<string, any>): void {
  for (const [key, value] of Object.entries(fields)) {
    switch (key) {
      case 'youtubeUrl':
        target.youtube_url = value;
        break;
      case 'youtubeVideoId':
        target.youtube_video_id = value;
        break;
      case 'aiMetadata':
      case 'metadata':
        target.ai_metadata = typeof value === 'string' ? JSON.parse(value) : value;
        break;
      case 'imageUrl':
      case 'generatedImage':
        target.image_url = value;
        break;
      case 'thumbnailUrl':
        target.thumbnail_url = value;
        break;
      case 'title':
      case 'trackName':
        target.name = value;
        break;
      case 'audioUrl':
        target.file_url = value;
        break;
      case 'status':
        target.status = typeof value === 'string' ? value.toLowerCase() : value;
        break;
      case 'errorMessage':
        target.error_message = value;
        break;
      case 'genre':
        target.genre = value;
        break;
      case 'mood':
        target.mood = value;
        break;
      case 'style':
        target.style = value;
        break;
      case 'energy':
        target.energy = value;
        break;
      case 'visualStyle':
        target.visual_style = value;
        break;
      case 'bpm':
        target.bpm = value;
        break;
      default:
        // Pass through snake_case keys directly
        target[key] = value;
        break;
    }
  }
}

// ─── Genre Images ───────────────────────────────────────────────────────

export interface GenreImage {
  id: string;
  genre: string;
  imageUrl: string;
}

export async function getGenreImages(genre: string, count = 20): Promise<GenreImage[]> {
  const supabase = getSupabase();
  const genresToTry = [genre, ...getGenreFallbacks(genre)];

  for (const g of genresToTry) {
    const { data, error } = await supabase
      .from('genre_images')
      .select('*')
      .ilike('genre', g)
      .limit(100);

    if (error) {
      console.warn(`[Supabase] Genre images query failed for "${g}": ${error.message}`);
      continue;
    }

    if (data && data.length > 0) {
      const images: GenreImage[] = data.map(row => ({
        id: row.id,
        genre: row.genre,
        imageUrl: row.image_url,
      }));

      console.log(`[Supabase] Found ${images.length} images for genre "${g}" (requested "${genre}")`);
      const shuffled = shuffleArray(images);
      return shuffled.slice(0, count);
    }
  }

  console.warn(`[Supabase] No genre images found for "${genre}" or fallbacks`);
  return [];
}

export async function getAvailableGenres(): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('genre_images')
    .select('genre')
    .limit(1000);

  if (error) throw new Error(`getAvailableGenres failed: ${error.message}`);

  const genres = new Set<string>();
  for (const row of data || []) {
    if (row.genre) genres.add(row.genre);
  }
  return Array.from(genres).sort();
}

export async function saveGeneratedImagesToGenreLibrary(
  genre: string,
  imageUrls: string[]
): Promise<void> {
  if (imageUrls.length === 0) return;

  const supabase = getSupabase();
  const rows = imageUrls.map(url => ({
    genre,
    image_url: url,
  }));

  const { error } = await supabase
    .from('genre_images')
    .insert(rows);

  if (error) throw new Error(`saveGeneratedImagesToGenreLibrary failed: ${error.message}`);

  console.log(`[Supabase] Saved ${imageUrls.length} images to genre "${genre}"`);
}

// ─── Legacy compatibility (used by getRecord/createRecord in API routes) ──

export async function getRecord(_tableName: string, recordId: string): Promise<AirtableRecord> {
  const song = await getSongById(recordId);
  return {
    id: song.id,
    fields: { ...song },
    createdTime: song.createdAt,
  };
}

export async function createRecord(_tableName: string, fields: Record<string, any>): Promise<AirtableRecord> {
  const song = await createSong({
    title: fields['Track Name'] || fields.title || fields.name || 'Untitled',
    artist: fields.artist,
    audioUrl: Array.isArray(fields['Audio File'])
      ? fields['Audio File'][0]?.url || ''
      : fields.audioUrl || fields.file_url || '',
  });
  return {
    id: song.id,
    fields: { ...song },
    createdTime: song.createdAt,
  };
}

// ─── Brand Video helpers (kept for compatibility) ──────────────────────

export async function pollForBrandVideoTriggers(): Promise<AirtableBrandVideoRecord[]> {
  // Not migrated yet — return empty
  return [];
}

export async function updateBrandVideoStatus(
  _recordId: string,
  _status: AirtableBrandVideoRecord['status'],
  _extraFields?: Record<string, any>
): Promise<void> {
  // Not migrated yet
}

// ─── Utility ────────────────────────────────────────────────────────────

function getGenreFallbacks(genre: string): string[] {
  const lower = genre.toLowerCase();
  const fallbackMap: Record<string, string[]> = {
    romantic: ['sensual', 'dream'],
    sensual: ['romantic', 'dream'],
    rock: ['training', 'pop'],
    pop: ['dance', 'dream'],
    dance: ['training', 'pop'],
    dream: ['nostalgic', 'romantic'],
    nostalgic: ['dream', 'romantic'],
    training: ['dance', 'rock'],
  };
  return fallbackMap[lower] || ['pop', 'dream'];
}

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
}
