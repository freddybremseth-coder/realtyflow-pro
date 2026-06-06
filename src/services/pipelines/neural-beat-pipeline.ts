import { updateSongStatus, updateSongFields, getGenreImages, saveGeneratedImagesToGenreLibrary } from '@/services/integrations/airtable-client';
import { analyzeSong, generateYouTubeSEO, generateMusicImageSet } from '@/services/integrations/gemini-client';
import { renderVideo, cleanupRender, isAvailable as isFFmpegAvailable } from '@/services/integrations/ffmpeg-renderer';
import { composeThumbnailVariants } from '@/services/integrations/thumbnail-composer';
import { generateShort, buildShortsTitle } from '@/services/integrations/shorts-generator';
import { buildChapters, injectChaptersIntoDescription } from '@/services/integrations/chapter-builder';
import { getTopTrendingTags } from '@/services/integrations/trending-tags-store';
import { pickBestPublishTime } from '@/services/integrations/publish-time-picker';
import {
  generateMultilingualIntro,
  injectMultilingualIntro,
  type TranslatedBlocks,
} from '@/services/integrations/description-translator';
import { uploadVideo, setThumbnail, listPlaylists, createPlaylist, addToPlaylist } from '@/services/integrations/youtube-client';
import {
  SongRecord,
  PipelineRun,
  PipelineStep,
} from '@/lib/types';
import { generateId } from '@/lib/utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createClient } from '@supabase/supabase-js';

// All Neural Beat uploads belong to the Re-Master Freddy YouTube channel.
// The brand_settings row with this brand_id must hold a valid
// youtube_refresh_token — re-run /api/oauth/google?brand=remasterfreddy and
// select the Re-Master Freddy channel on the Google consent screen if it
// ever falls out of sync. Env var overrides for flexibility in preview deploys.
const NEURAL_BEAT_BRAND_ID = process.env.NEURAL_BEAT_BRAND_ID || 'remasterfreddy';
const REMASTER_ADMIN_URL =
  process.env.REMASTER_ADMIN_URL ||
  process.env.NEXT_PUBLIC_REMASTER_ADMIN_URL ||
  'https://remasterfreddy.vercel.app/admin';
const NEURAL_BEAT_RECONNECT_URL = `https://realtyflow.chatgenius.pro/api/oauth/google?brand=remasterfreddy&return_to=${encodeURIComponent(REMASTER_ADMIN_URL)}`;

const STEP_NAMES = [
  'Update Status to Processing',
  'Download Audio File',
  'Analyze Song with AI',
  'Generate YouTube SEO Metadata',
  'Generate & Fetch Images',
  'Render Video with FFmpeg',
  'Upload to YouTube',
  'Save Results to Database',
  'Generate & Upload YouTube Short',
] as const;

function createStep(name: string, _index: number): PipelineStep {
  return {
    name,
    status: 'pending',
    startedAt: undefined,
    completedAt: undefined,
    error: undefined,
  };
}

function markStepRunning(step: PipelineStep): void {
  step.status = 'in_progress';
  step.startedAt = new Date().toISOString();
}

function markStepCompleted(step: PipelineStep): void {
  step.status = 'completed';
  step.completedAt = new Date().toISOString();
}

function markStepFailed(step: PipelineStep, error: string): void {
  step.status = 'failed';
  step.completedAt = new Date().toISOString();
  step.error = error;
}

function markStepSkipped(step: PipelineStep): void {
  step.status = 'skipped';
}

/**
 * Upload a file buffer to Supabase Storage and return the public URL.
 */
async function uploadToSupabaseStorage(
  buffer: Buffer,
  filename: string,
  folder = 'genre-library',
  contentType = 'image/png',
): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured for storage upload');

  const supabase = createClient(url, key);
  const storagePath = `${folder}/${Date.now()}-${filename}`;

  const { error } = await supabase.storage
    .from('neural-beat')
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (error) throw new Error(`Supabase storage upload failed: ${error.message}`);

  const { data: publicData } = supabase.storage
    .from('neural-beat')
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

// ─── Playlist Mapping ──────────────────────────────────────────────
// Maps AI-detected mood/energy/genre to YouTube playlist names.
// If a playlist doesn't exist, it gets created automatically.

const PLAYLIST_RULES: Array<{
  name: string;
  description: string;
  match: (mood: string, energy: string, genre: string) => boolean;
}> = [
  {
    name: '🏋️ Treningsmusikk | Workout Beats',
    description: 'High-energy tracks perfect for workouts and training. AI-curated by Re-Master Freddy.',
    match: (mood, energy) =>
      energy === 'high' || mood.includes('energetic') || mood.includes('aggressive') || mood.includes('intense') || mood.includes('power'),
  },
  {
    name: '📚 Studere & Fokus | Study & Focus',
    description: 'Calm, focused beats for studying and deep work. AI-curated by Re-Master Freddy.',
    match: (mood, energy, genre) =>
      (mood.includes('focus') || mood.includes('ambient') || genre.includes('lo-fi') || genre.includes('lofi')) && energy !== 'high',
  },
  {
    name: '🌅 Morgenchill | Morning Vibes',
    description: 'Gentle, uplifting tracks to start your day. AI-curated by Re-Master Freddy.',
    match: (mood) =>
      mood.includes('uplifting') || mood.includes('cheerful') || mood.includes('happy') || mood.includes('sunrise') || mood.includes('morning'),
  },
  {
    name: '🌙 Kveldschill | Evening Relaxation',
    description: 'Relaxing tracks for winding down in the evening. AI-curated by Re-Master Freddy.',
    match: (mood, energy) =>
      (mood.includes('chill') || mood.includes('relax') || mood.includes('calm') || mood.includes('peaceful')) && energy === 'low',
  },
  {
    name: '💜 Deep & Dreamy | Atmospheric',
    description: 'Deep, atmospheric, and dreamy soundscapes. AI-curated by Re-Master Freddy.',
    match: (mood, _energy, genre) =>
      mood.includes('dream') || mood.includes('ethereal') || mood.includes('atmospheric') || genre.includes('ambient') || genre.includes('downtempo'),
  },
  {
    name: '🔥 Dance & Party | EDM Hits',
    description: 'Upbeat dance tracks and EDM bangers. AI-curated by Re-Master Freddy.',
    match: (mood, energy, genre) =>
      genre.includes('dance') || genre.includes('edm') || genre.includes('house') || genre.includes('techno') || (energy === 'high' && mood.includes('euphori')),
  },
  {
    name: '❤️ Romantic & Sensual | Love Vibes',
    description: 'Romantic and sensual music for intimate moments. AI-curated by Re-Master Freddy.',
    match: (mood) =>
      mood.includes('romantic') || mood.includes('sensual') || mood.includes('love') || mood.includes('passion'),
  },
  {
    name: '🎵 Re-Master Freddy | Alle spor',
    description: 'Complete collection of all Re-Master Freddy tracks. AI-generated music.',
    match: () => true, // Catch-all: every song goes here
  },
];

function getPlaylistForSong(mood: string, energy: string, genre: string): typeof PLAYLIST_RULES[0] {
  const moodLower = mood.toLowerCase();
  const genreLower = genre.toLowerCase();
  return PLAYLIST_RULES.find((r) => r.match(moodLower, energy, genreLower)) || PLAYLIST_RULES[PLAYLIST_RULES.length - 1];
}

async function ensurePlaylistAndAdd(
  videoId: string,
  mood: string,
  energy: string,
  genre: string,
  brandId?: string,
): Promise<string> {
  const target = getPlaylistForSong(mood, energy, genre);
  const catchAll = PLAYLIST_RULES[PLAYLIST_RULES.length - 1];

  // Fetch existing playlists
  const existing = await listPlaylists(brandId);

  // Helper: find or create playlist
  const findOrCreate = async (rule: typeof PLAYLIST_RULES[0]): Promise<string> => {
    const found = existing.find((p) => p.title === rule.name);
    if (found) return found.id;
    const created = await createPlaylist(rule.name, rule.description, 'public', brandId);
    return created.id;
  };

  // Add to the matched playlist
  const playlistId = await findOrCreate(target);
  await addToPlaylist(playlistId, videoId, brandId);

  // Also add to catch-all "Alle spor" if it's not already the catch-all
  if (target.name !== catchAll.name) {
    try {
      const catchAllId = await findOrCreate(catchAll);
      await addToPlaylist(catchAllId, videoId, brandId);
    } catch {
      // Non-fatal
    }
  }

  console.log(`[NeuralBeatPipeline] Added to playlist: "${target.name}"`);
  return target.name;
}

export class NeuralBeatPipeline {
  /** The live PipelineRun, mutated in place so callers can poll progress. */
  public currentRun: PipelineRun | null = null;

  /** Called after each step update — used by SSE streaming to push progress to client. */
  public onProgress?: (run: PipelineRun) => void;

  async execute(songRecord: SongRecord, options?: {
    customImageUrls?: string[];
    logoUrl?: string;
    /**
     * Optional user-uploaded thumbnail. If provided, skips AI thumbnail
     * composition entirely and uses this image verbatim (resized to 1280×720
     * by YouTube on upload).
     */
    customThumbnailUrl?: string;
    /**
     * When true (and customPublishAt is not set), auto-pick the best upcoming
     * publish time based on the genre/mood + channel history. Upload goes out
     * immediately as PRIVATE and YouTube flips it to PUBLIC at the scheduled
     * time.
     */
    autoSchedule?: boolean;
    /** Explicit ISO datetime — overrides autoSchedule. */
    customPublishAt?: string;
    /**
     * Prepend a 3-language (NO/EN/ES) intro + CTA to the description. Off by
     * default to preserve token budget on high-volume batches. Default: false.
     */
    multilingualDescription?: boolean;
  }): Promise<PipelineRun> {
    // Pre-check: verify FFmpeg is available before starting the pipeline
    const ffmpegOk = await isFFmpegAvailable();
    if (!ffmpegOk) {
      console.error('[NeuralBeatPipeline] FFmpeg is not installed! Pipeline cannot render video.');
      // We still start the pipeline but will fail at step 6 with a clear message
    }

    console.log(`[NeuralBeatPipeline] Starting pipeline for "${songRecord.title}" (FFmpeg: ${ffmpegOk ? 'OK' : 'NOT FOUND'})`);

    const steps: PipelineStep[] = STEP_NAMES.map((name, index) =>
      createStep(name, index)
    );

    const pipelineRun: PipelineRun = {
      id: generateId(),
      type: 'neural-beat',
      status: 'running',
      steps,
      input: songRecord,
      output: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    // Expose the run object so callers can poll for real-time step progress
    this.currentRun = pipelineRun;

    // Notify callback after each state change (used by SSE streaming)
    const notify = () => this.onProgress?.(pipelineRun);

    // Wrap mark functions to auto-notify on each state change
    const stepRunning = (s: PipelineStep) => { markStepRunning(s); notify(); };
    const stepCompleted = (s: PipelineStep) => { markStepCompleted(s); notify(); };
    const stepFailed = (s: PipelineStep, err: string) => { markStepFailed(s, err); notify(); };
    const stepSkipped = (s: PipelineStep) => { markStepSkipped(s); notify(); };

    let currentStepIndex = 0;
    let audioUrl: string | null = null;
    let songAnalysis: Awaited<ReturnType<typeof analyzeSong>> | null = null;
    let youtubeMetadata: Awaited<ReturnType<typeof generateYouTubeSEO>> | null = null;
    let localImagePaths: string[] = [];
    let thumbnailBuffer: Buffer | null = null;
    let thumbnailVariantBuffers: Buffer[] = [];
    let thumbnailVariantUrls: string[] = [];
    let videoRenderPath: string | null = null;
    let videoBuffer: Buffer | null = null;
    let renderedDurationSec: number | null = null;
    let chapterMarkers: Array<{ t: number; label: string }> = [];
    let translatedIntro: TranslatedBlocks | null = null;
    let youtubeUrl: string | null = null;
    let youtubeVideoId: string | null = null;
    let playlistName: string | null = null;
    let genreImageUrl: string | null = null;
    let aiImageLocalPaths: string[] = [];  // Track AI-generated image paths for saving back to Airtable
    let aiImageBuffers: Buffer[] = [];  // Keep decoded buffers around for thumbnail composition
    let usedImageGenre: string = '';        // Genre used for this song's images

    try {
      // Step 1: Update Airtable status to "Processing"
      // Graceful: if this fails (e.g. no Status column), log a warning and continue
      currentStepIndex = 0;
      stepRunning(steps[currentStepIndex]);
      try {
        await updateSongStatus(songRecord.id, 'Processing');
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          '[NeuralBeatPipeline] Step 1: Could not update Airtable status (non-fatal, continuing):',
          message
        );
        // Mark as completed with a note rather than crashing the pipeline
        stepCompleted(steps[currentStepIndex]);
        steps[currentStepIndex].result = `Skipped status update: ${message}`;
      }

      // Step 2: Download audio file
      currentStepIndex = 1;
      stepRunning(steps[currentStepIndex]);
      try {
        audioUrl = songRecord.audioUrl || null;
        if (!audioUrl) {
          throw new Error('No audio URL found in song record');
        }

        // Check if this is an expired Airtable URL
        const isAirtableUrl = audioUrl.includes('airtableusercontent.com');

        // Validate the audio URL is accessible
        const response = await fetch(audioUrl, { method: 'HEAD' });
        if (!response.ok) {
          if (isAirtableUrl) {
            throw new Error(
              `Lydfilen er en utløpt Airtable-lenke (HTTP ${response.status}). ` +
              `Last opp MP3-filen på nytt via Re-Master Freddy-opplastingen for å lagre den i Supabase.`
            );
          }
          throw new Error(`Audio file not accessible: HTTP ${response.status}`);
        }
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 2 failed: ${message}`);
      }

      // Step 3: Claude analyzes title/metadata -> genre, style, mood
      currentStepIndex = 2;
      stepRunning(steps[currentStepIndex]);
      try {
        songAnalysis = await analyzeSong({
          title: songRecord.title,
          artist: songRecord.artist,
          audioUrl: audioUrl!,
          metadata: songRecord.metadata || undefined,
        });
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 3 failed: ${message}`);
      }

      // Step 4: Gemini generates YouTube SEO metadata
      currentStepIndex = 3;
      stepRunning(steps[currentStepIndex]);
      try {
        youtubeMetadata = await generateYouTubeSEO({
          title: songRecord.title,
          artist: songRecord.artist,
          genre: songAnalysis!.genre,
          style: songAnalysis!.style,
          mood: songAnalysis!.mood,
        });

        // Merge up to 3 currently-trending YouTube Music tags that the weekly
        // cron has harvested. Non-fatal: no trending data yet → no change.
        try {
          const trending = await getTopTrendingTags(3, youtubeMetadata.tags);
          if (trending.length > 0) {
            // Keep tag list under YouTube's ~500-char budget (conservative).
            const merged = [...youtubeMetadata.tags];
            for (const t of trending) {
              const joined = [...merged, t].join(',');
              if (joined.length > 480) break;
              merged.push(t);
            }
            youtubeMetadata.tags = merged;
            console.log(`[NeuralBeatPipeline] Merged ${trending.length} trending tags: ${trending.join(', ')}`);
          }
        } catch (err) {
          console.warn('[NeuralBeatPipeline] Trending tag merge skipped:', err instanceof Error ? err.message : err);
        }

        // Optionally prepend a NO/EN/ES intro+CTA block so the description
        // reaches all three audiences right at the fold.
        if (options?.multilingualDescription) {
          try {
            steps[currentStepIndex].result = 'Oversetter beskrivelse (NO/EN/ES)...';
            notify();
            translatedIntro = await generateMultilingualIntro({
              title: songRecord.title,
              artist: songRecord.artist,
              genre: songAnalysis!.genre,
              mood: songAnalysis!.mood,
            });
            if (translatedIntro) {
              youtubeMetadata.description = injectMultilingualIntro(
                youtubeMetadata.description,
                translatedIntro,
              );
              console.log('[NeuralBeatPipeline] Prepended 3-language intro to description');
            }
          } catch (err) {
            console.warn('[NeuralBeatPipeline] Multilingual intro skipped:', err instanceof Error ? err.message : err);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 4 failed: ${message}`);
      }

      // Step 5: HYBRID — Generate AI images (unique) + Fetch genre images from database
      // AI images are unique to the song's mood/style, database images add visual variety
      // Both run in PARALLEL to minimize total time
      currentStepIndex = 4;
      stepRunning(steps[currentStepIndex]);
      try {
        const imageGenre = songAnalysis!.imageGenre || 'dance';
        const imgTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-images-'));

        steps[currentStepIndex].result = `Generating AI images + fetching "${imageGenre}" from database...`;
        notify();

        // Run AI generation and database fetch in PARALLEL for speed
        const [aiResult, genreImages] = await Promise.all([
          // 1. Generate 5 unique AI images with Gemini (based on song mood)
          generateMusicImageSet({
            title: songRecord.title,
            artist: songRecord.artist,
            genre: songAnalysis!.genre,
            style: songAnalysis!.style,
            mood: songAnalysis!.mood,
            energy: songAnalysis!.energy,
            visualStyle: songAnalysis!.visualStyle,
            count: 5,
          }).catch(err => {
            console.warn(`[NeuralBeatPipeline] AI image generation failed (non-fatal): ${err instanceof Error ? err.message : err}`);
            return { images: [] as Array<{ base64: string; mimeType: string; prompt: string }> };
          }),
          // 2. Fetch 15 genre images from database
          getGenreImages(imageGenre, 15).catch(err => {
            console.warn(`[NeuralBeatPipeline] Genre image fetch failed (non-fatal): ${err instanceof Error ? err.message : err}`);
            return [] as Awaited<ReturnType<typeof getGenreImages>>;
          }),
        ]);

        console.log(`[NeuralBeatPipeline] AI: ${aiResult.images.length} images, DB: ${genreImages.length} images`);
        steps[currentStepIndex].result = `AI: ${aiResult.images.length}, DB: ${genreImages.length} images — downloading...`;
        notify();

        // Track genre for saving AI images back to Airtable later
        usedImageGenre = imageGenre;

        // Save AI-generated images to temp files (from base64) + keep buffers in
        // memory so we can compose thumbnail variants without re-reading disk.
        const aiImagePaths: string[] = [];
        aiImageBuffers = [];
        for (let i = 0; i < aiResult.images.length; i++) {
          const img = aiResult.images[i];
          const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
          const imgPath = path.join(imgTempDir, `ai-${i}.${ext}`);
          const buf = Buffer.from(img.base64, 'base64');
          await fs.writeFile(imgPath, buf);
          aiImagePaths.push(imgPath);
          aiImageBuffers.push(buf);
        }
        // Save reference for step 8 (save back to genre library for reuse)
        aiImageLocalPaths = aiImagePaths;

        // Download genre images to temp files (parallel)
        const downloadPromises = genreImages.map(async (img, i) => {
          const imgPath = path.join(imgTempDir, `genre-${i}.jpg`);
          try {
            const response = await fetch(img.imageUrl);
            if (!response.ok) {
              console.warn(`[NeuralBeatPipeline] Genre image ${i} download failed: ${response.status}`);
              return null;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(imgPath, buffer);
            return imgPath;
          } catch {
            return null;
          }
        });
        const genreImagePaths = (await Promise.all(downloadPromises)).filter((p): p is string => p !== null);

        const totalImages = aiImagePaths.length + genreImagePaths.length;
        if (totalImages === 0) {
          throw new Error(`No images available from AI generation or Airtable genre "${imageGenre}". Cannot create video.`);
        }

        // Download custom images (user-uploaded branding images)
        const customImagePaths: string[] = [];
        if (options?.customImageUrls && options.customImageUrls.length > 0) {
          console.log(`[NeuralBeatPipeline] Downloading ${options.customImageUrls.length} custom images...`);
          for (let i = 0; i < options.customImageUrls.length; i++) {
            try {
              const imgPath = path.join(imgTempDir, `custom-${i}.jpg`);
              const response = await fetch(options.customImageUrls[i]);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                await fs.writeFile(imgPath, buffer);
                customImagePaths.push(imgPath);
              }
            } catch {
              console.warn(`[NeuralBeatPipeline] Custom image ${i} download failed (non-fatal)`);
            }
          }
        }

        // Interleave: spread AI images evenly among Airtable images for visual variety
        // Pattern example with 5 AI + 15 Airtable = 20 total:
        //   [AI, AT, AT, AT, AI, AT, AT, AT, AI, AT, AT, AT, AI, AT, AT, AT, AI, AT, AT, AT]
        const allPaths: string[] = [];
        let aiIdx = 0;
        let atIdx = 0;
        const aiInterval = aiImagePaths.length > 0
          ? Math.max(1, Math.floor(totalImages / aiImagePaths.length))
          : totalImages + 1;

        for (let i = 0; i < totalImages; i++) {
          if (aiIdx < aiImagePaths.length && i % aiInterval === 0) {
            allPaths.push(aiImagePaths[aiIdx++]);
          } else if (atIdx < genreImagePaths.length) {
            allPaths.push(genreImagePaths[atIdx++]);
          } else if (aiIdx < aiImagePaths.length) {
            allPaths.push(aiImagePaths[aiIdx++]);
          }
        }
        // Add any remaining images
        while (aiIdx < aiImagePaths.length) allPaths.push(aiImagePaths[aiIdx++]);
        while (atIdx < genreImagePaths.length) allPaths.push(genreImagePaths[atIdx++]);

        // Insert custom images at fixed positions (5, 9, 17, etc.)
        // These are branding/personal images that should appear throughout the video
        if (customImagePaths.length > 0) {
          const insertPositions = [4, 8, 16]; // 0-indexed: positions 5, 9, 17
          for (let i = 0; i < customImagePaths.length; i++) {
            const pos = i < insertPositions.length
              ? Math.min(insertPositions[i], allPaths.length)
              : allPaths.length; // append extras at end
            allPaths.splice(pos, 0, customImagePaths[i]);
          }
          console.log(`[NeuralBeatPipeline] Inserted ${customImagePaths.length} custom images at positions`);
        }

        localImagePaths = allPaths;

        // Remember one genre image URL as a fallback cover for the DB record.
        if (genreImages.length > 0) {
          genreImageUrl = genreImages[0].imageUrl;
        }
        // NOTE: thumbnail composition happens after this step (once we have
        // youtubeMetadata + song analysis + logo buffer).

        console.log(`[NeuralBeatPipeline] ${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${genreImagePaths.length} Airtable)`);
        steps[currentStepIndex].result = `${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${genreImagePaths.length} Airtable)`;

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 5 failed: ${message}`);
      }

      // Pre-load logo buffer once — reused for both video watermark and
      // composed thumbnails so we only download it once.
      let logoBuffer: Buffer | undefined;
      let logoPath: string | undefined;
      if (options?.logoUrl) {
        try {
          const logoRes = await fetch(options.logoUrl);
          if (logoRes.ok) {
            logoBuffer = Buffer.from(await logoRes.arrayBuffer());
            const logoTempPath = path.join(os.tmpdir(), `nb-logo-${Date.now()}.png`);
            await fs.writeFile(logoTempPath, logoBuffer);
            logoPath = logoTempPath;
            console.log('[NeuralBeatPipeline] Logo downloaded for watermark + thumbnail overlay');
          }
        } catch {
          console.warn('[NeuralBeatPipeline] Logo download failed (non-fatal)');
        }
      }

      // Step 6: FFmpeg renders multi-scene slideshow video (local, $0 cost)
      // Free memory before render — imageSetResult held large base64 strings
      if (global.gc) { try { global.gc(); } catch {} }
      currentStepIndex = 5;
      stepRunning(steps[currentStepIndex]);
      try {
        console.log('[NeuralBeatPipeline] Starting FFmpeg render (local, zero cost)...');

        const renderResult = await renderVideo({
          audioUrl: audioUrl!,
          imagePaths: localImagePaths,
          title: songRecord.title,
          subtitle: songRecord.artist,
          logoPath,
          onSegmentProgress: (current, total) => {
            // Update step result with segment progress to keep SSE alive
            steps[currentStepIndex].result = `Encoding segment ${current}/${total}`;
            notify();
          },
        });

        // Cleanup logo temp file
        if (logoPath) {
          try { await fs.unlink(logoPath); } catch {}
        }
        videoRenderPath = renderResult.videoPath;
        videoBuffer = renderResult.videoBuffer;
        renderedDurationSec = renderResult.durationSeconds;
        console.log(`[NeuralBeatPipeline] Video rendered: ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB, ${renderedDurationSec.toFixed(1)}s`);

        // Inject YouTube chapter markers into the description so the player
        // auto-shows a progress-bar chapter strip. This materially boosts
        // watch-time (viewers skim to their favorite section).
        try {
          const { block, markers } = buildChapters(renderedDurationSec, {
            mood: songAnalysis?.mood,
            genre: songAnalysis?.genre,
          });
          if (block && youtubeMetadata) {
            youtubeMetadata.description = injectChaptersIntoDescription(
              youtubeMetadata.description,
              block,
            );
            chapterMarkers = markers;
            console.log(`[NeuralBeatPipeline] Injected ${markers.length} chapter markers`);
          }
        } catch (err) {
          console.warn('[NeuralBeatPipeline] Chapter injection skipped:', err instanceof Error ? err.message : err);
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 6 failed: ${message}`);
      }

      // User-supplied custom thumbnail short-circuits everything else — fetch
      // it once and bypass the AI composition step entirely.
      if (options?.customThumbnailUrl) {
        try {
          const res = await fetch(options.customThumbnailUrl);
          if (res.ok) {
            thumbnailBuffer = Buffer.from(await res.arrayBuffer());
            console.log(`[NeuralBeatPipeline] Using user-supplied custom thumbnail (${(thumbnailBuffer.length / 1024).toFixed(0)} KB)`);
          } else {
            console.warn(`[NeuralBeatPipeline] Custom thumbnail fetch HTTP ${res.status} — falling back to AI composition`);
          }
        } catch (err) {
          console.warn('[NeuralBeatPipeline] Custom thumbnail fetch failed — falling back:', err instanceof Error ? err.message : err);
        }
      }

      // Compose 3 A/B thumbnail variants with burned-in hook text + logo badge.
      // Non-fatal: if all variants fail we fall back to raw AI image.
      // Skipped when a custom thumbnail was successfully loaded above.
      try {
        if (thumbnailBuffer && options?.customThumbnailUrl) {
          console.log('[NeuralBeatPipeline] Skipping AI thumbnail composition — user supplied a custom one');
        }
        const availableBackgrounds = aiImageBuffers.slice(0, 3);
        const variants = (youtubeMetadata!.thumbnailVariants || []).slice(0, availableBackgrounds.length);
        if (!thumbnailBuffer && availableBackgrounds.length > 0 && variants.length > 0) {
          steps[5].result = `Komponerer ${variants.length} thumbnail-varianter...`;
          notify();
          thumbnailVariantBuffers = await composeThumbnailVariants(
            availableBackgrounds,
            variants,
            { brand: 'RE-MASTER FREDDY', logoBuffer },
          );
          if (thumbnailVariantBuffers.length > 0) {
            thumbnailBuffer = thumbnailVariantBuffers[0];
            console.log(`[NeuralBeatPipeline] ${thumbnailVariantBuffers.length} thumbnail variants composed`);
          }
        }
        // Fallback: raw AI image if composition produced nothing
        if (!thumbnailBuffer && aiImageBuffers.length > 0) {
          thumbnailBuffer = aiImageBuffers[0];
          console.log('[NeuralBeatPipeline] Thumbnail composition empty — using raw AI image as fallback');
        }
      } catch (err) {
        console.warn('[NeuralBeatPipeline] Thumbnail composition failed (non-fatal):', err instanceof Error ? err.message : err);
        if (!thumbnailBuffer && aiImageBuffers.length > 0) {
          thumbnailBuffer = aiImageBuffers[0];
        }
      }

      // Step 7: Upload video buffer directly to YouTube (no intermediate download)
      currentStepIndex = 6;
      stepRunning(steps[currentStepIndex]);

      // Resolve scheduled publish time (before upload so we can log it).
      let publishAtIso: string | null = null;
      let publishScheduleReason: string | null = null;
      try {
        if (options?.customPublishAt) {
          const d = new Date(options.customPublishAt);
          if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 15 * 60 * 1000) {
            publishAtIso = d.toISOString();
            publishScheduleReason = 'user-specified publishAt';
          } else {
            console.warn('[NeuralBeatPipeline] customPublishAt rejected — too soon or invalid');
          }
        } else if (options?.autoSchedule) {
          const picked = await pickBestPublishTime({
            mood: songAnalysis?.mood,
            genre: songAnalysis?.genre,
          });
          publishAtIso = picked.isoDate;
          publishScheduleReason = picked.reason;
          steps[currentStepIndex].result = `Planlagt ${picked.isoDate} (${picked.minutesFromNow} min frem)`;
          notify();
          console.log(`[NeuralBeatPipeline] Scheduled publish: ${picked.isoDate} — ${picked.reason}`);
        }
      } catch (err) {
        console.warn('[NeuralBeatPipeline] Publish-time pick failed — uploading immediately:', err instanceof Error ? err.message : err);
      }

      try {
        const uploadResult = await uploadVideo(videoBuffer!, {
          title: youtubeMetadata!.title,
          description: youtubeMetadata!.description,
          tags: youtubeMetadata!.tags,
          categoryId: youtubeMetadata!.categoryId,
          privacyStatus: publishAtIso
            ? 'private'
            : ((youtubeMetadata!.privacyStatus as 'public' | 'private' | 'unlisted') || 'public'),
          publishAt: publishAtIso || undefined,
        }, NEURAL_BEAT_BRAND_ID, { requireBrandToken: true });
        youtubeUrl = uploadResult.youtubeUrl;
        youtubeVideoId = uploadResult.videoId;
        steps[currentStepIndex].result = `Lastet opp og verifisert: ${uploadResult.youtubeUrl} (${uploadResult.privacyStatus || 'ukjent status'}, kanal ${uploadResult.channelId || 'ukjent'})`;
        notify();

        // Try to set custom thumbnail (requires channel verification)
        if (thumbnailBuffer) {
          try {
            await setThumbnail(uploadResult.videoId, thumbnailBuffer, NEURAL_BEAT_BRAND_ID);
            console.log('[NeuralBeatPipeline] Custom thumbnail set successfully');
          } catch (e) {
            console.warn('[NeuralBeatPipeline] Could not set custom thumbnail (non-fatal):', e);
          }
        }

        // Add video to auto-detected playlist based on mood/energy/genre
        if (songAnalysis && youtubeVideoId) {
          try {
            steps[currentStepIndex].result = 'Legger til i spilleliste...';
            notify();
            playlistName = await ensurePlaylistAndAdd(
              youtubeVideoId,
              songAnalysis.mood,
              songAnalysis.energy,
              songAnalysis.genre,
              NEURAL_BEAT_BRAND_ID,
            );
            steps[currentStepIndex].result = `Lagt til i "${playlistName}"`;
            notify();
          } catch (e) {
            console.warn('[NeuralBeatPipeline] Playlist assignment failed (non-fatal):', e);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : String(error);
        const message = /invalid[_\s]grant|expired or revoked|utløpt|tilbakekalt/i.test(rawMessage)
          ? `YouTube-tilkoblingen for Re-Master Freddy er utløpt eller tilbakekalt. Koble til på nytt her: ${NEURAL_BEAT_RECONNECT_URL}`
          : rawMessage;
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 7 failed: ${message}`);
      }

      // Step 8: Save results to database + save AI images to genre library
      currentStepIndex = 7;
      stepRunning(steps[currentStepIndex]);
      try {
        // Persist all thumbnail variants so a later A/B rotation can swap them.
        if (thumbnailVariantBuffers.length > 0 && youtubeVideoId) {
          try {
            const uploads = await Promise.all(
              thumbnailVariantBuffers.map((buf, i) =>
                uploadToSupabaseStorage(
                  buf,
                  `thumb-${youtubeVideoId}-v${i}.png`,
                  'thumbnails',
                ).catch((e) => {
                  console.warn(`[NeuralBeatPipeline] Thumbnail variant ${i} upload failed:`, e);
                  return null;
                }),
              ),
            );
            thumbnailVariantUrls = uploads.filter((u): u is string => !!u);
            console.log(`[NeuralBeatPipeline] Saved ${thumbnailVariantUrls.length} thumbnail variants to storage`);
          } catch (err) {
            console.warn('[NeuralBeatPipeline] Thumbnail variant persistence failed (non-fatal):', err);
          }
        }

        await updateSongFields(songRecord.id, {
          youtubeUrl: youtubeUrl!,
          status: 'published',
          genre: songAnalysis!.genre,
          style: songAnalysis!.style,
          mood: songAnalysis!.mood,
          energy: songAnalysis!.energy,
          visualStyle: songAnalysis!.visualStyle,
          bpm: (songAnalysis as any)?.bpm,
          aiMetadata: {
            youtubeTitle: youtubeMetadata!.title,
            youtubeDescription: youtubeMetadata!.description,
            tags: youtubeMetadata!.tags,
            renderer: 'ffmpeg',
            processedAt: new Date().toISOString(),
            playlist: playlistName || undefined,
            thumbnailVariantUrls,
            activeThumbnailIndex: thumbnailVariantUrls.length > 0 ? 0 : undefined,
            thumbnailHooks: (youtubeMetadata!.thumbnailVariants || []).map((v) => v.hook),
            chapterMarkers: chapterMarkers.length > 0 ? chapterMarkers : undefined,
            durationSeconds: renderedDurationSec ?? undefined,
            customThumbnail: !!options?.customThumbnailUrl,
            customImageCount: options?.customImageUrls?.length || 0,
            scheduledPublishAt: publishAtIso || undefined,
            scheduledPublishReason: publishScheduleReason || undefined,
            multilingualIntro: translatedIntro || undefined,
          },
          ...(genreImageUrl ? { imageUrl: genreImageUrl } : {}),
        });

        // Save AI-generated images to genre library for future reuse.
        if (aiImageLocalPaths.length > 0 && usedImageGenre) {
          try {
            console.log(`[NeuralBeatPipeline] Saving ${aiImageLocalPaths.length} AI images to genre library "${usedImageGenre}"...`);
            steps[currentStepIndex].result = `Saving ${aiImageLocalPaths.length} AI images to genre library...`;
            notify();

            // Upload AI images to Supabase Storage in parallel
            const uploadPromises = aiImageLocalPaths.map(async (imgPath, i) => {
              try {
                const buffer = await fs.readFile(imgPath);
                const filename = `ai-${usedImageGenre}-${Date.now()}-${i}.png`;
                const url = await uploadToSupabaseStorage(buffer, filename);
                console.log(`[NeuralBeatPipeline] Uploaded AI image ${i + 1}/${aiImageLocalPaths.length} → storage`);
                return url;
              } catch (err) {
                console.warn(`[NeuralBeatPipeline] Failed to upload AI image ${i}: ${err instanceof Error ? err.message : err}`);
                return null;
              }
            });

            const uploadedUrls = (await Promise.all(uploadPromises)).filter((u): u is string => u !== null);

            if (uploadedUrls.length > 0) {
              await saveGeneratedImagesToGenreLibrary(usedImageGenre, uploadedUrls);
              console.log(`[NeuralBeatPipeline] Saved ${uploadedUrls.length} AI images to "${usedImageGenre}" genre library`);
            }
          } catch (err) {
            console.warn(`[NeuralBeatPipeline] Failed to save AI images to genre library (non-fatal): ${err instanceof Error ? err.message : err}`);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 8 failed: ${message}`);
      }

      // Step 9: Generate & Upload YouTube Short (non-fatal)
      // Uses drop-detect + burned hook + loopable cross-fade for virality.
      currentStepIndex = 8;
      stepRunning(steps[currentStepIndex]);
      try {
        if (videoBuffer && youtubeMetadata && audioUrl) {
          steps[currentStepIndex].result = 'Analyserer drop og genererer Short...';
          notify();

          // Pick a hook for the burned overlay — reuse the first thumbnail
          // variant so the Short visually echoes the main video thumbnail.
          const firstVariant = youtubeMetadata.thumbnailVariants?.[0];
          const shortsHook = firstVariant?.hook || songAnalysis?.mood?.toUpperCase() || 'NEW DROP';
          const shortsEndCard = 'FULL VERSION IN DESC 👇';

          const shortResult = await generateShort({
            videoBuffer,
            targetDuration: 35,
            hook: shortsHook,
            endCard: shortsEndCard,
            accentColor: 'ff3366',
            loopFade: 0.5,
          });

          const shortsTitle = buildShortsTitle({
            title: songRecord.title,
            genre: songAnalysis?.genre || 'EDM',
            mood: songAnalysis?.mood || 'energetic',
            hook: shortsHook,
          });

          const shortsDescription = [
            `${youtubeMetadata.description.split('\n')[0]}`,
            '',
            `🎧 Full version: ${youtubeUrl}`,
            `🎵 Drop lands at ${Math.round(shortResult.dropStartSeconds + 3)}s in the full version`,
            '',
            '#Shorts #AIMusic #ReMasterFreddy #ChillBeats #StudyMusic #EDM',
          ].join('\n');

          const shortsResult = await uploadVideo(shortResult.videoBuffer, {
            title: shortsTitle,
            description: shortsDescription,
            tags: [...youtubeMetadata.tags.slice(0, 17), 'Shorts', 'YouTube Shorts', 'Short'],
            categoryId: youtubeMetadata.categoryId,
            privacyStatus: 'public',
          }, NEURAL_BEAT_BRAND_ID, { requireBrandToken: true });

          console.log(`[NeuralBeatPipeline] YouTube Short uploaded: ${shortsResult.youtubeUrl}`);

          await updateSongFields(songRecord.id, {
            aiMetadata: {
              youtubeTitle: youtubeMetadata.title,
              youtubeDescription: youtubeMetadata.description,
              tags: youtubeMetadata.tags,
              renderer: 'ffmpeg',
              processedAt: new Date().toISOString(),
              shortsUrl: shortsResult.youtubeUrl,
              shortsVideoId: shortsResult.videoId,
              shortsHook,
              shortsDropStartSeconds: shortResult.dropStartSeconds,
              shortsDetectionMethod: shortResult.detectionMethod,
            },
          });

          steps[currentStepIndex].result = `Short uploaded (${shortResult.detectionMethod}): ${shortsResult.youtubeUrl}`;
        } else {
          steps[currentStepIndex].result = 'Skipped - no video buffer available';
        }
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        // Non-fatal: don't fail the pipeline if Shorts generation fails
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[NeuralBeatPipeline] Shorts generation failed (non-fatal): ${message}`);
        steps[currentStepIndex].result = `Feilet (ikke-kritisk): ${message}`;
        stepCompleted(steps[currentStepIndex]); // Mark completed even on failure since it's optional
      }

      // Pipeline completed successfully
      pipelineRun.status = 'completed';
      pipelineRun.completedAt = new Date().toISOString();
      pipelineRun.output = {
        youtubeUrl,
        songAnalysis,
        youtubeMetadata,
        localImagePaths,
        genreImageUrl,
        playlistName,
      };
      notify();
    } catch (error) {
      // Mark all remaining pending steps as skipped
      for (let i = currentStepIndex + 1; i < steps.length; i++) {
        if (steps[i].status === 'pending') {
          stepSkipped(steps[i]);
        }
      }

      pipelineRun.status = 'failed';
      pipelineRun.completedAt = new Date().toISOString();
      pipelineRun.error = error instanceof Error ? error.message : String(error);
      notify();

      // Try to write error info to database (graceful)
      try {
        await updateSongFields(songRecord.id, {
          status: 'error',
          errorMessage: pipelineRun.error,
          aiMetadata: {
            error: pipelineRun.error,
            failedAt: new Date().toISOString(),
            lastStep: steps[currentStepIndex]?.name,
          },
        });
      } catch (dbError) {
        console.error(
          '[NeuralBeatPipeline] Failed to update error metadata:',
          dbError
        );
      }
    } finally {
      // Clean up temp files (render directory + image directory)
      if (videoRenderPath) {
        try {
          await cleanupRender(videoRenderPath);
        } catch {
          console.warn('[NeuralBeatPipeline] Could not clean up render temp files');
        }
      }
      if (localImagePaths.length > 0) {
        const imgDir = path.dirname(localImagePaths[0]);
        try {
          await fs.rm(imgDir, { recursive: true });
          console.log('[NeuralBeatPipeline] Cleaned up image temp files');
        } catch {
          console.warn('[NeuralBeatPipeline] Could not clean up image temp files');
        }
      }
    }

    return pipelineRun;
  }
}
