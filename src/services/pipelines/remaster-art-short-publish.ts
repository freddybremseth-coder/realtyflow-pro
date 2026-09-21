import { createClient } from '@supabase/supabase-js';
import { generateArtShortFromAudio } from '@/services/integrations/shorts-generator';
import { loadSongArtGallery, artCreditsDescription, type ArtVisualMode } from './remaster-song-art';
import { uploadVideo } from '@/services/integrations/youtube-client';

const VALID_MODES = new Set(['meditation','relaxing','alternative']);
const BRAND = process.env.NEURAL_BEAT_BRAND_ID || 'remasterfreddy';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service connection missing');
  return createClient(url, key);
}

async function loadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error('Art Short source download HTTP ' + res.status);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 1024 || data.length > 40 * 1024 * 1024) throw new Error('Art Short source invalid or too large');
  return data;
}

/**
 * Publish ONLY the missing, branded art Short. Never re-upload the main video.
 * Used both by the owner-only Admin button and the automated recovery cron.
 */
export async function publishMissingArtShort(songId: string): Promise<{
  status: 'already-published' | 'published' | 'processing';
  shortUrl: string | null;
  videoUrl: string | null;
}> {
  if (!/^[0-9a-f-]{36}$/i.test(songId)) throw new Error('Invalid song ID');
  const supabase = getClient();
  const { data: song, error } = await supabase.from('songs')
    .select('id,name,brand,file_url,youtube_url,ai_metadata')
    .eq('id', songId).eq('brand', BRAND).single();
  if (error || !song) throw new Error('Re-Master Freddy song not found');
  const metadata = song.ai_metadata && typeof song.ai_metadata === 'object' ? song.ai_metadata : {};
  const mode: ArtVisualMode = metadata.artVisualMode;
  if (!VALID_MODES.has(String(mode))) throw new Error('This song is not a published art-video song');
  if (!song.youtube_url || !song.file_url) throw new Error('Publish the full song before generating its Short');
  if (metadata.shortsUrl) return { status: 'already-published', shortUrl: metadata.shortsUrl, videoUrl: song.youtube_url };
  if (metadata.shortsStatus === 'needs-reconciliation') {
    throw new Error('A Short may already be uploaded. Check YouTube and reconcile its link before retrying, to avoid duplicates.');
  }
  // A short-lived DB claim prevents the cron + owner button from racing.
  const previousStarted = new Date(metadata.shortsAttemptedAt || 0).getTime();
  if (metadata.shortsStatus === 'processing' && Date.now() - previousStarted < 20*60_000) {
    return { status: 'processing', shortUrl: null, videoUrl: song.youtube_url };
  }
  const startedAt = new Date().toISOString();
  const claimed = { ...metadata, shortsStatus: 'processing', shortsAttemptedAt: startedAt, shortsError: null };
  // Compare a small per-attempt token instead of passing the entire
  // (potentially very large) AI/artwork metadata JSON in the request URL.
  // Exactly one concurrent retry can claim a given previous attempt.
  const previousAttempt = typeof metadata.shortsAttemptedAt === 'string'
    ? metadata.shortsAttemptedAt : null;
  let claimQuery = supabase.from('songs').update({ ai_metadata: claimed })
    .eq('id', songId).is('ai_metadata->>shortsUrl', null);
  claimQuery = previousAttempt
    ? claimQuery.filter('ai_metadata->>shortsAttemptedAt', 'eq', previousAttempt)
    : claimQuery.is('ai_metadata->>shortsAttemptedAt', null);
  const { data: claim, error: claimError } = await claimQuery.select('id').maybeSingle();
  if (claimError) throw new Error('Could not claim art Short job: ' + claimError.message);
  if (!claim) return { status: 'processing', shortUrl: null, videoUrl: song.youtube_url };
  try {
    // Do not trust arbitrary URLs in song metadata. Load only the published
    // gallery preview catalog, never private artwork masters or generic EDM.
    const gallery = await loadSongArtGallery(songId, mode!);
    if (gallery.length === 0) throw new Error('No published public art previews for Short');
    const [audioBuffer, artworkBuffer] = await Promise.all([
      loadBuffer(song.file_url),
      loadBuffer(gallery[0].imageUrl),
    ]);
    const short = await generateArtShortFromAudio({
      audioBuffer, artworkBuffer, title: song.name, category: mode!,
      targetDuration: 35,
    });
    const title = `${song.name} | ${mode![0].toUpperCase()+mode!.slice(1)} Art & Music #Shorts`.slice(0, 100);
    const description = [
      `🎧 Full song: ${song.youtube_url}`,
      artCreditsDescription(songId),
      '#Shorts #ReMasterFreddy #FreddyBremsethArt',
    ].join('\n\n');
    const uploaded = await uploadVideo(short.videoBuffer, {
      title, description,
      tags: ['Shorts','Re-Master Freddy','Freddy Bremseth Art',mode!,song.name],
      categoryId: '10', privacyStatus: 'public', defaultAudioLanguage: 'zxx',
    }, BRAND, { requireBrandToken: true });
    const finished = {
      ...claimed, shortsStatus: 'published', shortsError: null,
      shortsUrl: uploaded.youtubeUrl, shortsVideoId: uploaded.videoId,
      shortsHook: mode!.toUpperCase(),
      shortsDropStartSeconds: short.startSeconds,
      shortsDetectionMethod: 'art-calm-section',
      shortsPublishedAt: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await supabase.from('songs').update({ ai_metadata: finished })
      .eq('id', songId).filter('ai_metadata->>shortsAttemptedAt', 'eq', startedAt)
      .filter('ai_metadata->>shortsStatus', 'eq', 'processing')
      .select('id').maybeSingle();
    if (saveError || !saved) {
      throw new Error('Short uploaded at ' + uploaded.youtubeUrl + ' but metadata save failed: ' + (saveError?.message || 'song metadata changed while publishing'));
    }
    return { status: 'published', shortUrl: uploaded.youtubeUrl, videoUrl: song.youtube_url };
  } catch(err) {
    const message = err instanceof Error ? err.message : String(err);
    // Preserve the published YouTube link if an upload succeeded but DB
    // reconciliation failed: human intervention avoids duplicate uploads.
    const uncertainUpload = message.includes('but metadata save failed');
    await supabase.from('songs').update({
      ai_metadata: {
        ...claimed,
        shortsStatus: uncertainUpload ? 'needs-reconciliation' : 'failed',
        shortsError: message.slice(0, 1200),
      },
    }).eq('id', songId).filter('ai_metadata->>shortsAttemptedAt', 'eq', startedAt)
      .filter('ai_metadata->>shortsStatus', 'eq', 'processing');
    throw err;
  }
}
