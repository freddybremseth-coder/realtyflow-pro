import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { composeThumbnail } from '@/services/integrations/thumbnail-composer';
import {
  extractVideoId,
  setThumbnail,
  updateVideoMetadata,
} from '@/services/integrations/youtube-client';
import {
  artCreditsDescription,
  loadSongArtGallery,
  type ArtVisualMode,
} from '@/services/pipelines/remaster-song-art';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BRAND = 'remasterfreddy';
const REPAIR_VERSION = 'calm-youtube-2026-09-26-v1';

const TARGETS: Record<string, { title: string; hook: string; mode: Exclude<ArtVisualMode, null> }> = {
  'c394f275-88a7-4222-a638-bd1b84850e25': {
    title: 'Deep Ocean Stillness | Meditation & Deep Calm',
    hook: 'DEEP CALM',
    mode: 'meditation',
  },
  'efe16e23-f591-4178-be8b-a3deb09abece': {
    title: 'Eastern Serenity | Peaceful Ambient & Relaxation',
    hook: 'SERENE FLOW',
    mode: 'relaxing',
  },
  'd1a7c599-dfa8-4c45-a986-9d1a4520270d': {
    title: 'Healing Waves of Light | Healing Meditation & Deep Calm',
    hook: 'HEALING WAVES',
    mode: 'meditation',
  },
  'c74180ca-bafb-48d2-8da1-290ec6588c34': {
    title: 'Lotus Blossom Meditation | Zen Meditation & Inner Stillness',
    hook: 'INNER STILLNESS',
    mode: 'meditation',
  },
  'ee5cf403-74e2-4174-8582-689fc4cc114c': {
    title: 'Sunset Serenity Instrumental | Calm Ambient & Relaxation',
    hook: 'SUNSET CALM',
    mode: 'relaxing',
  },
  '7d737cc1-ba77-490d-9bdf-329be8117c28': {
    title: 'Quiet Temple Breath | Zen Meditation & Calm Breathing',
    hook: 'ZEN BREATH',
    mode: 'meditation',
  },
  '46ca5722-4297-490d-9206-fd700fd22cce': {
    title: 'Still and Light | Meditation & Inner Stillness',
    hook: 'INNER STILLNESS',
    mode: 'meditation',
  },
  'fe823ad3-1af6-4320-874c-859c603df740': {
    title: 'The Warm Tide | Relaxing Ambient & Gentle Calm',
    hook: 'GENTLE TIDE',
    mode: 'relaxing',
  },
  'f7c09119-1616-4824-97d5-6127eadebe80': {
    title: 'Weightless Blue | Meditation & Deep Calm',
    hook: 'DEEP CALM',
    mode: 'meditation',
  },
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service connection missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function chaptersFrom(description: unknown) {
  const value = typeof description === 'string' ? description : '';
  const match = value.match(/⏱ CHAPTERS\n[\s\S]*?(?=\n\n|$)/);
  return match?.[0]?.trim() || '';
}

function calmDescription(name: string, songId: string, mode: 'meditation' | 'relaxing', previous: unknown) {
  const chapters = chaptersFrom(previous);
  const purpose = mode === 'meditation'
    ? 'A peaceful meditation and ambient piece for stillness, slow breathing, reflection, quiet focus and deep calm.'
    : 'A gentle ambient piece for relaxation, unwinding, quiet focus and a slower, peaceful atmosphere.';
  const tags = mode === 'meditation'
    ? '#ReMasterFreddy #MeditationMusic #ZenMusic #AmbientMusic #DeepCalm #RelaxingMusic'
    : '#ReMasterFreddy #RelaxingMusic #AmbientMusic #CalmMusic #PeacefulMusic #MeditationMusic';

  return [
    `${name} by Re-Master Freddy`,
    '',
    purpose,
    'No rush, no drop, no festival energy — this release belongs to the calm side of Re-Master Freddy.',
    chapters ? `\n${chapters}` : '',
    '',
    artCreditsDescription(songId),
    '',
    tags,
  ].filter(Boolean).join('\n').slice(0, 4900);
}

function calmTags(name: string, mode: 'meditation' | 'relaxing') {
  const common = ['Re-Master Freddy', name, 'Ambient Music', 'Relaxing Music', 'Calm Music', 'Peaceful Music'];
  return mode === 'meditation'
    ? [...common, 'Meditation Music', 'Zen Music', 'Mindfulness Music', 'Deep Calm']
    : [...common, 'Meditation Music', 'Chill Ambient', 'Relaxation Music', 'Soft Ambient'];
}

/**
 * Fixed, idempotent one-time repair for Re-Master Freddy calm videos that were
 * published before the calm visual/metadata routing fix. No request input is
 * accepted, so this route cannot target arbitrary videos or metadata.
 *
 * This endpoint is intentionally temporary and will be removed after the
 * repair has been verified in production.
 */
export async function GET() {
  const supabase = getSupabase();
  const ids = Object.keys(TARGETS);
  const { data: songs, error } = await supabase
    .from('songs')
    .select('id,name,youtube_url,youtube_video_id,ai_metadata')
    .in('id', ids);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const song of songs || []) {
    const target = TARGETS[song.id];
    if (!target) continue;

    const existingMeta = song.ai_metadata && typeof song.ai_metadata === 'object' ? song.ai_metadata : {};
    if (existingMeta.calmYoutubeRepairVersion === REPAIR_VERSION && existingMeta.calmYoutubeRepairAppliedAt) {
      results.push({ songId: song.id, name: song.name, status: 'already-applied' });
      continue;
    }

    const videoId = song.youtube_video_id || extractVideoId(song.youtube_url || '');
    if (!videoId) {
      results.push({ songId: song.id, name: song.name, status: 'skipped', error: 'Missing YouTube video id' });
      continue;
    }

    const description = calmDescription(song.name, song.id, target.mode === 'meditation' ? 'meditation' : 'relaxing', existingMeta.youtubeDescription);
    const tags = calmTags(song.name, target.mode === 'meditation' ? 'meditation' : 'relaxing');

    let metadataUpdated = false;
    let thumbnailUpdated = false;
    let thumbnailError: string | null = null;

    try {
      await updateVideoMetadata(videoId, {
        title: target.title,
        description,
        tags,
        categoryId: '10',
      }, BRAND);
      metadataUpdated = true;

      try {
        const gallery = await loadSongArtGallery(song.id, target.mode, 4);
        if (!gallery.length) throw new Error('No calm public art preview available');
        const imageResponse = await fetch(gallery[0].imageUrl);
        if (!imageResponse.ok) throw new Error(`Art preview HTTP ${imageResponse.status}`);
        const thumbnail = await composeThumbnail({
          backgroundBuffer: Buffer.from(await imageResponse.arrayBuffer()),
          artworkMode: true,
          hook: target.hook,
          titleText: song.name,
          brand: 'RE-MASTER FREDDY',
        });
        await setThumbnail(videoId, thumbnail, BRAND);
        thumbnailUpdated = true;
      } catch (thumbErr) {
        thumbnailError = thumbErr instanceof Error ? thumbErr.message : String(thumbErr);
      }

      const now = new Date().toISOString();
      const repairedMeta = {
        ...existingMeta,
        youtubeTitle: target.title,
        youtubeDescription: description,
        tags,
        thumbnailHooks: [target.hook],
        artVisualMode: target.mode,
        calmYoutubeRepairVersion: REPAIR_VERSION,
        calmYoutubeMetadataAppliedAt: now,
        ...(thumbnailUpdated ? { calmYoutubeRepairAppliedAt: now } : {}),
        ...(thumbnailError ? { calmYoutubeThumbnailError: thumbnailError.slice(0, 500) } : { calmYoutubeThumbnailError: null }),
      };

      const { error: saveError } = await supabase.from('songs').update({
        genre: target.mode === 'meditation' ? 'Meditation Ambient' : 'Ambient',
        style: target.mode === 'meditation' ? 'meditative ambient' : 'soft ambient',
        mood: target.mode === 'meditation' ? 'meditative peaceful' : 'calm peaceful',
        energy: 'low',
        visual_style: 'Serene still water, mist, soft dawn light, peaceful nature and zen calm; no DJs, parties, dancing, cars, boats, nightlife or neon.',
        ai_metadata: repairedMeta,
      }).eq('id', song.id);

      if (saveError) throw new Error('YouTube updated but database sync failed: ' + saveError.message);

      results.push({
        songId: song.id,
        name: song.name,
        videoId,
        status: thumbnailUpdated ? 'applied' : 'metadata-applied-thumbnail-failed',
        title: target.title,
        hook: target.hook,
        metadataUpdated,
        thumbnailUpdated,
        thumbnailError,
      });
    } catch (repairError) {
      results.push({
        songId: song.id,
        name: song.name,
        videoId,
        status: 'failed',
        metadataUpdated,
        thumbnailUpdated,
        error: repairError instanceof Error ? repairError.message : String(repairError),
      });
    }
  }

  const failed = results.filter((item) => item.status === 'failed').length;
  return NextResponse.json(
    { success: failed === 0, repairVersion: REPAIR_VERSION, count: results.length, failed, results },
    { status: failed === 0 ? 200 : 207, headers: { 'Cache-Control': 'no-store' } },
  );
}
