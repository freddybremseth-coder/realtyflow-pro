import { updateSongStatus, updateSongFields, getGenreImages, saveGeneratedImagesToGenreLibrary } from '@/services/integrations/airtable-client';
import { analyzeSong, generateYouTubeSEO, generateMusicImageSet } from '@/services/integrations/gemini-client';
import { renderVideo, cleanupRender, isAvailable as isFFmpegAvailable } from '@/services/integrations/ffmpeg-renderer';
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
async function uploadToSupabaseStorage(buffer: Buffer, filename: string): Promise<string> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured for storage upload');

  const supabase = createClient(url, key);
  const storagePath = `genre-library/${Date.now()}-${filename}`;

  const { error } = await supabase.storage
    .from('neural-beat')
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: false });

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

async function ensurePlaylistAndAdd(videoId: string, mood: string, energy: string, genre: string): Promise<string> {
  const target = getPlaylistForSong(mood, energy, genre);
  const catchAll = PLAYLIST_RULES[PLAYLIST_RULES.length - 1];

  // Fetch existing playlists
  const existing = await listPlaylists();

  // Helper: find or create playlist
  const findOrCreate = async (rule: typeof PLAYLIST_RULES[0]): Promise<string> => {
    const found = existing.find((p) => p.title === rule.name);
    if (found) return found.id;
    const created = await createPlaylist(rule.name, rule.description, 'public');
    return created.id;
  };

  // Add to the matched playlist
  const playlistId = await findOrCreate(target);
  await addToPlaylist(playlistId, videoId);

  // Also add to catch-all "Alle spor" if it's not already the catch-all
  if (target.name !== catchAll.name) {
    try {
      const catchAllId = await findOrCreate(catchAll);
      await addToPlaylist(catchAllId, videoId);
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
    let videoRenderPath: string | null = null;
    let videoBuffer: Buffer | null = null;
    let youtubeUrl: string | null = null;
    let youtubeVideoId: string | null = null;
    let playlistName: string | null = null;
    let genreImageUrl: string | null = null;
    let aiImageLocalPaths: string[] = [];  // Track AI-generated image paths for saving back to Airtable
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

        // Save AI-generated images to temp files (from base64)
        const aiImagePaths: string[] = [];
        for (let i = 0; i < aiResult.images.length; i++) {
          const img = aiResult.images[i];
          const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
          const imgPath = path.join(imgTempDir, `ai-${i}.${ext}`);
          await fs.writeFile(imgPath, Buffer.from(img.base64, 'base64'));
          aiImagePaths.push(imgPath);
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

        // Pick a RANDOM AI image as YouTube thumbnail for variety (not always the first one)
        if (aiResult.images.length > 0) {
          const thumbIdx = Math.floor(Math.random() * aiResult.images.length);
          thumbnailBuffer = Buffer.from(aiResult.images[thumbIdx].base64, 'base64');
          genreImageUrl = genreImages.length > 0 ? genreImages[0].imageUrl : null;
        } else if (genreImages.length > 0) {
          try {
            const thumbResponse = await fetch(genreImages[0].imageUrl);
            if (thumbResponse.ok) {
              thumbnailBuffer = Buffer.from(await thumbResponse.arrayBuffer());
            }
          } catch {
            console.warn('[NeuralBeatPipeline] Could not download thumbnail (non-fatal)');
          }
          genreImageUrl = genreImages[0].imageUrl;
        }

        console.log(`[NeuralBeatPipeline] ${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${genreImagePaths.length} Airtable)`);
        steps[currentStepIndex].result = `${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${genreImagePaths.length} Airtable)`;

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 5 failed: ${message}`);
      }

      // Step 6: FFmpeg renders multi-scene slideshow video (local, $0 cost)
      // Free memory before render — imageSetResult held large base64 strings
      if (global.gc) { try { global.gc(); } catch {} }
      currentStepIndex = 5;
      stepRunning(steps[currentStepIndex]);
      try {
        console.log('[NeuralBeatPipeline] Starting FFmpeg render (local, zero cost)...');

        // Download logo to temp file if provided
        let logoPath: string | undefined;
        if (options?.logoUrl) {
          try {
            const logoTempPath = path.join(os.tmpdir(), `nb-logo-${Date.now()}.png`);
            const logoRes = await fetch(options.logoUrl);
            if (logoRes.ok) {
              const logoBuf = Buffer.from(await logoRes.arrayBuffer());
              await fs.writeFile(logoTempPath, logoBuf);
              logoPath = logoTempPath;
              console.log('[NeuralBeatPipeline] Logo downloaded for watermark overlay');
            }
          } catch {
            console.warn('[NeuralBeatPipeline] Logo download failed (non-fatal)');
          }
        }

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
        console.log(`[NeuralBeatPipeline] Video rendered: ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 6 failed: ${message}`);
      }

      // Step 7: Upload video buffer directly to YouTube (no intermediate download)
      currentStepIndex = 6;
      stepRunning(steps[currentStepIndex]);
      try {
        const uploadResult = await uploadVideo(videoBuffer!, {
          title: youtubeMetadata!.title,
          description: youtubeMetadata!.description,
          tags: youtubeMetadata!.tags,
          categoryId: youtubeMetadata!.categoryId,
          privacyStatus: (youtubeMetadata!.privacyStatus as 'public' | 'private' | 'unlisted') || 'public',
        });
        youtubeUrl = uploadResult.youtubeUrl;
        youtubeVideoId = uploadResult.videoId;

        // Try to set custom thumbnail (requires channel verification)
        if (thumbnailBuffer) {
          try {
            await setThumbnail(uploadResult.videoId, thumbnailBuffer);
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
              songAnalysis.genre
            );
            steps[currentStepIndex].result = `Lagt til i "${playlistName}"`;
            notify();
          } catch (e) {
            console.warn('[NeuralBeatPipeline] Playlist assignment failed (non-fatal):', e);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 7 failed: ${message}`);
      }

      // Step 8: Save results to database + save AI images to genre library
      currentStepIndex = 7;
      stepRunning(steps[currentStepIndex]);
      try {
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
      currentStepIndex = 8;
      stepRunning(steps[currentStepIndex]);
      try {
        if (videoBuffer && youtubeMetadata && audioUrl) {
          // Use FFmpeg to create a 30-45 second vertical Short from the video
          const shortsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neural-short-'));
          const inputVideoPath = path.join(shortsDir, 'input.mp4');
          const shortsVideoPath = path.join(shortsDir, 'short.mp4');
          await fs.writeFile(inputVideoPath, videoBuffer);

          // Get audio duration to find the best clip section (aim for middle 30-45 seconds)
          const { execSync } = require('child_process');
          let duration = 120; // default 2min
          try {
            const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputVideoPath}"`, { encoding: 'utf8' });
            duration = parseFloat(probe.trim()) || 120;
          } catch { /* use default */ }

          // Take 30-45 seconds from the best part (typically 30-40% into the song)
          const shortDuration = Math.min(45, Math.max(30, duration * 0.35));
          const startTime = Math.max(0, Math.floor(duration * 0.3));

          // Create vertical 9:16 crop from center of 16:9 video, with the audio
          const ffmpegCmd = [
            'ffmpeg', '-y',
            '-ss', String(startTime),
            '-i', `"${inputVideoPath}"`,
            '-t', String(Math.floor(shortDuration)),
            '-vf', '"crop=ih*9/16:ih,scale=1080:1920"',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            `"${shortsVideoPath}"`,
          ].join(' ');

          execSync(ffmpegCmd, { timeout: 120000 });

          const shortsBuffer = await fs.readFile(shortsVideoPath);

          // Create Shorts-optimized title and description
          const shortsTitle = `${youtubeMetadata.title.split('|')[0].trim()} #Shorts`.slice(0, 100);
          const shortsDescription = `${youtubeMetadata.description.split('\n')[0]}\n\nFull version: ${youtubeUrl}\n\n#Shorts #AIMusic #ReMasterFreddy #ChillBeats #StudyMusic #EDM`;

          const shortsResult = await uploadVideo(shortsBuffer, {
            title: shortsTitle,
            description: shortsDescription,
            tags: [...youtubeMetadata.tags, 'Shorts', 'Short', 'YouTube Shorts'],
            categoryId: youtubeMetadata.categoryId,
            privacyStatus: 'public',
          });

          console.log(`[NeuralBeatPipeline] YouTube Short uploaded: ${shortsResult.youtubeUrl}`);

          // Save shorts URL to database
          await updateSongFields(songRecord.id, {
            aiMetadata: {
              youtubeTitle: youtubeMetadata.title,
              youtubeDescription: youtubeMetadata.description,
              tags: youtubeMetadata.tags,
              renderer: 'ffmpeg',
              processedAt: new Date().toISOString(),
              shortsUrl: shortsResult.youtubeUrl,
              shortsVideoId: shortsResult.videoId,
            },
          });

          steps[currentStepIndex].result = `Short uploaded: ${shortsResult.youtubeUrl}`;

          // Cleanup
          try { await fs.rm(shortsDir, { recursive: true }); } catch { /* silent */ }
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
