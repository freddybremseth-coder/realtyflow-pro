import { createClient } from '@supabase/supabase-js';
import { generateArtShortFromAudio, generateShortFromAudio, buildShortsTitle, detectTopSections } from '@/services/integrations/shorts-generator';
import { getGenreImages } from '@/services/integrations/airtable-client';
import { classifyArtVisualMode, loadSongArtGallery, artCreditsDescription, type ArtVisualMode } from './remaster-song-art';
import { uploadVideo } from '@/services/integrations/youtube-client';

const VALID_MODES = new Set(['meditation','relaxing','alternative']);
const BRAND = process.env.NEURAL_BEAT_BRAND_ID || 'remasterfreddy';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service connection missing');
  return createClient(url, key);
}

async function loadBuffer(url: string, timeoutMs = 25_000): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error('Art Short source download HTTP ' + res.status);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 1024 || data.length > 40 * 1024 * 1024) throw new Error('Art Short source invalid or too large');
  return data;
}

/**
 * Publish ONLY the missing, branded Short. Never re-upload the main video.
 * Used both by the owner-only Admin button and the automated recovery cron.
 */
export async function publishMissingShort(songId: string): Promise<{
  status: 'already-published' | 'published' | 'processing';
  shortUrl: string | null;
  videoUrl: string | null;
}> {
  if (!/^[0-9a-f-]{36}$/i.test(songId)) throw new Error('Invalid song ID');
  const supabase = getClient();
  const { data: song, error } = await supabase.from('songs')
    .select('id,name,brand,file_url,youtube_url,genre,mood,ai_metadata')
    .eq('id', songId).eq('brand', BRAND).single();
  if (error || !song) throw new Error('Re-Master Freddy song not found');
  const metadata = song.ai_metadata && typeof song.ai_metadata === 'object' ? song.ai_metadata : {};
  const storedMode: ArtVisualMode = metadata.artVisualMode;
  const inferredMode = classifyArtVisualMode({
    title: song.name, genre: song.genre || undefined, mood: song.mood || undefined, metadata,
  });
  const mode: ArtVisualMode = VALID_MODES.has(String(storedMode)) ? storedMode : inferredMode;
  const artMode = VALID_MODES.has(String(mode));
  // Owner-triggered Shorts can be released independently of the full video.
  // The daily follow-up cron still selects only songs with published full videos.
  if (!song.file_url) throw new Error('Upload a song audio file before generating its Short');
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
  const claimed = {
    ...metadata,
    ...(artMode ? { artVisualMode: mode } : {}),
    shortsStatus: 'processing', shortsAttemptedAt: startedAt, shortsError: null,
  };
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
    const audioBuffer = await loadBuffer(song.file_url);
    let standardImages: Buffer[] = [];
    let artVariantArtwork: Buffer | null = null;
    let socialVariantStarts: number[] = [];
    // Artwork uses curated public previews; ordinary music uses saved genre
    // images and the existing MP3. Never upload the main YouTube video again.
    const short = artMode
      ? await (async () => {
          const gallery = await loadSongArtGallery(songId, mode!);
          if (gallery.length === 0) throw new Error('No published public art previews for Short');
          const artworkBuffer = await loadBuffer(gallery[0].imageUrl);
          artVariantArtwork = artworkBuffer;
          const result = await generateArtShortFromAudio({
            audioBuffer, artworkBuffer, title: song.name, category: mode!, targetDuration: 35,
          });
          socialVariantStarts = [result.startSeconds, result.startSeconds + 45, result.startSeconds + 90];
          return { videoBuffer: result.videoBuffer, startSeconds: result.startSeconds };
        })()
      : await (async () => {
          const records = await getGenreImages(
            !song.genre || song.genre.toLowerCase() === 'edm' ? 'dance' : song.genre, 18,
          );
          const images: Buffer[] = [];
          // Try more than the first three records: old Airtable links may
          // have expired. Fetch small batches so one broken URL cannot block
          // the whole render, and stop as soon as three images are usable.
          for (let i = 0; i < records.length && images.length < 3; i += 4) {
            const batch = await Promise.allSettled(records.slice(i, i + 4).map(
              (image) => loadBuffer(image.imageUrl, 8_000),
            ));
            for (const result of batch) {
              if (result.status === 'fulfilled' && images.length < 3) images.push(result.value);
              else if (result.status === 'rejected') {
                console.warn('[ShortRetry] Skipping inaccessible genre image:', result.reason);
              }
            }
          }
          if (!images.length) {
            throw new Error('No downloadable genre images for this music Short (checked ' + records.length + ' image records)');
          }
          standardImages = images;
          const ranked = await detectTopSections(audioBuffer).catch(() => [] as number[]);
          socialVariantStarts = (ranked.length ? ranked : [0])
            .map((t) => Math.max(0, t - 3))
            .slice(0, 3);
          const startSeconds = socialVariantStarts[0] ?? 0;
          const result = await generateShortFromAudio({
            audioBuffer, imageBuffers: images, startTime: startSeconds,
            hook: song.ai_metadata?.shortsHook || song.mood?.toUpperCase() || 'NEW MUSIC',
            titleText: song.name, targetDuration: 35,
          });
          return { videoBuffer: result.videoBuffer, startSeconds };
        })();
    const title = artMode
      ? (song.name + ' | ' + mode![0].toUpperCase() + mode!.slice(1) + ' Art & Music #Shorts').slice(0, 100)
      : buildShortsTitle({
          title: song.name, genre: song.genre || 'EDM', mood: song.mood || 'energetic',
        });
    const description = artMode
      ? [...(song.youtube_url ? ['🎧 Full song: ' + song.youtube_url] : []),
          artCreditsDescription(songId), '#Shorts #ReMasterFreddy #FreddyBremsethArt'].join('\n\n')
      : [...(song.youtube_url ? ['🎧 Full song: ' + song.youtube_url] : []),
          song.name + ' — Re-Master Freddy',
          '#Shorts #ReMasterFreddy #EDM #Music'].join('\n\n');
    const uploaded = await uploadVideo(short.videoBuffer, {
      title, description,
      tags: artMode ? ['Shorts','Re-Master Freddy','Freddy Bremseth Art',mode!,song.name]
        : ['Shorts','Re-Master Freddy','EDM',song.genre || 'dance',song.name],
      categoryId: '10', privacyStatus: 'public', defaultAudioLanguage: 'zxx',
    }, BRAND, { requireBrandToken: true });

    // Keep 2-3 reusable social variants without creating duplicate YouTube
    // uploads. Variant 1 is the published Short; extra variants use different
    // strong song sections so Growth OS can learn which hook performs best.
    let socialReelUrl: string | null = null;
    let socialReelStorageError: string | null = null;
    const socialReelVariants: Array<{ url: string; startSeconds: number; rank: number; score: number }> = [];
    try {
      const variantBuffers: Array<{ buffer: Buffer; startSeconds: number }> = [
        { buffer: short.videoBuffer, startSeconds: short.startSeconds },
      ];
      const extraStarts = socialVariantStarts
        .filter((start) => Math.abs(start - short.startSeconds) >= 20)
        .slice(0, 2);
      for (const startTime of extraStarts) {
        try {
          if (artMode && artVariantArtwork) {
            const rendered = await generateArtShortFromAudio({
              audioBuffer,
              artworkBuffer: artVariantArtwork,
              title: song.name,
              category: mode!,
              startTime,
              targetDuration: 35,
            });
            variantBuffers.push({ buffer: rendered.videoBuffer, startSeconds: rendered.startSeconds });
          } else if (!artMode && standardImages.length) {
            const rendered = await generateShortFromAudio({
              audioBuffer,
              imageBuffers: standardImages,
              startTime,
              hook: song.ai_metadata?.shortsHook || song.mood?.toUpperCase() || 'NEW MUSIC',
              titleText: song.name,
              targetDuration: 35,
            });
            variantBuffers.push({ buffer: rendered.videoBuffer, startSeconds: startTime });
          }
        } catch (variantError) {
          console.warn('[ShortRetry] Social Reel variant render failed:', variantError instanceof Error ? variantError.message : variantError);
        }
      }

      for (let index = 0; index < variantBuffers.length; index++) {
        const variant = variantBuffers[index];
        const socialPath = `remaster/${songId}/short-v${index + 1}.mp4`;
        const { error: socialUploadError } = await supabase.storage.from('remaster-reels').upload(
          socialPath,
          variant.buffer,
          { contentType: 'video/mp4', cacheControl: '3600', upsert: true },
        );
        if (socialUploadError) throw socialUploadError;
        const candidate = supabase.storage.from('remaster-reels').getPublicUrl(socialPath).data.publicUrl;
        if (candidate?.startsWith('https://')) {
          socialReelVariants.push({
            url: candidate,
            startSeconds: variant.startSeconds,
            rank: index + 1,
            score: 0,
          });
        }
      }
      socialReelUrl = socialReelVariants[0]?.url ?? null;
    } catch (storageError) {
      socialReelStorageError = storageError instanceof Error ? storageError.message : String(storageError);
    }

    const finished = {
      ...claimed, shortsStatus: 'published', shortsError: null,
      shortsUrl: uploaded.youtubeUrl, shortsVideoId: uploaded.videoId,
      shortsHook: artMode ? mode!.toUpperCase() : (song.mood?.toUpperCase() || 'NEW MUSIC'),
      shortsDropStartSeconds: short.startSeconds,
      shortsDetectionMethod: artMode ? 'art-calm-section' : 'audio-retry',
      shortsPublishedAt: new Date().toISOString(),
      socialReelUrl,
      socialReelVariants,
      socialReelVariantStrategy: artMode ? 'calm-section-exploration' : 'ranked-loudness-sections',
      socialReelStorageError,
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
    const uncertainUpload = message.includes('but metadata save failed')
      || message.includes('upload returned video id');
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



export async function backfillSocialReels(songId: string): Promise<{
  status: 'already-ready' | 'backfilled';
  socialReelUrl: string | null;
  variants: number;
}> {
  if (!/^[0-9a-f-]{36}$/i.test(songId)) throw new Error('Invalid song ID');
  const supabase = getClient();
  const { data: song, error } = await supabase.from('songs')
    .select('id,name,brand,file_url,youtube_url,genre,mood,image_url,thumbnail_url,ai_metadata')
    .eq('id', songId).eq('brand', BRAND).single();
  if (error || !song) throw new Error('Re-Master Freddy song not found');

  const metadata = song.ai_metadata && typeof song.ai_metadata === 'object' ? song.ai_metadata : {};
  const existingVariants = Array.isArray(metadata.socialReelVariants)
    ? metadata.socialReelVariants.filter((item: any) => typeof item?.url === 'string' && item.url.startsWith('https://'))
    : [];
  if (existingVariants.length > 0 || (typeof metadata.socialReelUrl === 'string' && metadata.socialReelUrl.startsWith('https://'))) {
    return {
      status: 'already-ready',
      socialReelUrl: metadata.socialReelUrl || existingVariants[0]?.url || null,
      variants: existingVariants.length || 1,
    };
  }
  if (!metadata.shortsUrl) throw new Error('Existing YouTube Short required before social Reel backfill');
  if (!song.file_url) throw new Error('Song audio file missing');

  const startedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase.from('songs')
    .update({ ai_metadata: { ...metadata, socialReelBackfillStatus: 'processing', socialReelBackfillStartedAt: startedAt, socialReelBackfillError: null } })
    .eq('id', songId)
    .or('ai_metadata->>socialReelBackfillStatus.is.null,ai_metadata->>socialReelBackfillStatus.neq.processing')
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error('Could not claim social Reel backfill: ' + claimError.message);
  if (!claimed) throw new Error('Social Reel backfill already processing');

  try {
    const audioBuffer = await loadBuffer(song.file_url);
    const storedMode: ArtVisualMode = metadata.artVisualMode;
    const inferredMode = classifyArtVisualMode({
      title: song.name, genre: song.genre || undefined, mood: song.mood || undefined, metadata,
    });
    const mode: ArtVisualMode = VALID_MODES.has(String(storedMode)) ? storedMode : inferredMode;
    const artMode = VALID_MODES.has(String(mode));

    let variantBuffers: Array<{ buffer: Buffer; startSeconds: number }> = [];
    if (artMode) {
      const gallery = await loadSongArtGallery(songId, mode!);
      if (!gallery.length) throw new Error('No published public art previews for social Reel backfill');
      const artworkBuffer = await loadBuffer(gallery[0].imageUrl);
      const baseStart = typeof metadata.shortsDropStartSeconds === 'number' ? metadata.shortsDropStartSeconds : 0;
      const starts = [baseStart, baseStart + 45, baseStart + 90];
      for (const startTime of starts) {
        try {
          const rendered = await generateArtShortFromAudio({
            audioBuffer,
            artworkBuffer,
            title: song.name,
            category: mode!,
            startTime,
            targetDuration: 35,
          });
          if (variantBuffers.every((v) => Math.abs(v.startSeconds - rendered.startSeconds) >= 15)) {
            variantBuffers.push({ buffer: rendered.videoBuffer, startSeconds: rendered.startSeconds });
          }
          if (variantBuffers.length >= 3) break;
        } catch (err) {
          console.warn('[ReelBackfill] Calm variant skipped:', err instanceof Error ? err.message : err);
        }
      }
    } else {
      const records = await getGenreImages(!song.genre || song.genre.toLowerCase() === 'edm' ? 'dance' : song.genre, 18).catch(() => []);
      const images: Buffer[] = [];
      for (let i = 0; i < records.length && images.length < 3; i += 4) {
        const batch = await Promise.allSettled(records.slice(i, i + 4).map((image) => loadBuffer(image.imageUrl, 8_000)));
        for (const result of batch) if (result.status === 'fulfilled' && images.length < 3) images.push(result.value);
      }
      const fallbackUrls = [
        ...(Array.isArray(metadata.thumbnailVariantUrls) ? metadata.thumbnailVariantUrls : []),
        song.image_url,
        song.thumbnail_url,
      ].filter((value): value is string => typeof value === 'string' && value.startsWith('https://'));
      for (const url of fallbackUrls) {
        if (images.length >= 3) break;
        try { images.push(await loadBuffer(url, 8_000)); } catch {}
      }
      if (!images.length) throw new Error('No downloadable images available for social Reel backfill');

      const ranked = await detectTopSections(audioBuffer).catch(() => [] as number[]);
      const existingStart = typeof metadata.shortsDropStartSeconds === 'number' ? metadata.shortsDropStartSeconds : 0;
      const starts = Array.from(new Set([
        ...ranked.map((t) => Math.max(0, t - 3)),
        existingStart,
        existingStart + 45,
        existingStart + 90,
      ])).filter((start) => Number.isFinite(start));

      for (const startTime of starts) {
        if (variantBuffers.some((v) => Math.abs(v.startSeconds - startTime) < 20)) continue;
        try {
          const rendered = await generateShortFromAudio({
            audioBuffer,
            imageBuffers: images,
            startTime,
            hook: metadata.shortsHook || song.mood?.toUpperCase() || 'NEW MUSIC',
            titleText: song.name,
            targetDuration: 35,
          });
          variantBuffers.push({ buffer: rendered.videoBuffer, startSeconds: startTime });
          if (variantBuffers.length >= 3) break;
        } catch (err) {
          console.warn('[ReelBackfill] Music variant skipped:', err instanceof Error ? err.message : err);
        }
      }
    }

    if (!variantBuffers.length) throw new Error('Could not render any social Reel variants');
    const socialReelVariants: Array<{ url: string; startSeconds: number; rank: number; score: number }> = [];
    for (let index = 0; index < variantBuffers.length; index++) {
      const variant = variantBuffers[index];
      const socialPath = `remaster/${songId}/short-v${index + 1}.mp4`;
      const { error: uploadError } = await supabase.storage.from('remaster-reels').upload(
        socialPath,
        variant.buffer,
        { contentType: 'video/mp4', cacheControl: '3600', upsert: true },
      );
      if (uploadError) throw uploadError;
      const url = supabase.storage.from('remaster-reels').getPublicUrl(socialPath).data.publicUrl;
      if (url?.startsWith('https://')) {
        socialReelVariants.push({ url, startSeconds: variant.startSeconds, rank: index + 1, score: 0 });
      }
    }
    if (!socialReelVariants.length) throw new Error('Social Reel storage returned no public URLs');

    const finished = {
      ...metadata,
      socialReelUrl: socialReelVariants[0].url,
      socialReelVariants,
      socialReelVariantStrategy: artMode ? 'calm-section-exploration' : 'ranked-loudness-sections',
      socialReelBackfillStatus: 'completed',
      socialReelBackfillCompletedAt: new Date().toISOString(),
      socialReelBackfillError: null,
    };
    const { error: saveError } = await supabase.from('songs').update({ ai_metadata: finished }).eq('id', songId);
    if (saveError) throw new Error('Could not save social Reel metadata: ' + saveError.message);

    return {
      status: 'backfilled',
      socialReelUrl: socialReelVariants[0].url,
      variants: socialReelVariants.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from('songs').update({
      ai_metadata: {
        ...metadata,
        socialReelBackfillStatus: 'failed',
        socialReelBackfillError: message.slice(0, 1200),
        socialReelBackfillFailedAt: new Date().toISOString(),
      },
    }).eq('id', songId);
    throw err;
  }
}

/** Legacy alias for the existing artwork-only follow-up caller. */
export const publishMissingArtShort = publishMissingShort;
