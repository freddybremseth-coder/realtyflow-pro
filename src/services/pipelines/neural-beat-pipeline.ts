import { updateSongStatus, updateSongFields, getGenreImages, saveGeneratedImagesToGenreLibrary } from '@/services/integrations/airtable-client';
import { analyzeSong, generateYouTubeSEO, generateMusicImageSet } from '@/services/integrations/gemini-client';
import { renderVideo, cleanupRender, isAvailable as isFFmpegAvailable } from '@/services/integrations/ffmpeg-renderer';
import { uploadVideo, setThumbnail } from '@/services/integrations/youtube-client';
import {
  AirtableSongRecord,
  PipelineRun,
  PipelineStep,
} from '@/lib/types';
import { generateId } from '@/lib/utils';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const STEP_NAMES = [
  'Update Airtable Status to Processing',
  'Download Audio File',
  'Analyze Song with AI',
  'Generate YouTube SEO Metadata',
  'Generate & Fetch Images',
  'Render Video with FFmpeg',
  'Upload to YouTube',
  'Update Airtable with Results',
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
 * Upload a file buffer to tmpfiles.org to get a temporary public URL.
 * Airtable will download from this URL and store the image permanently.
 * tmpfiles.org URLs last ~1 hour — more than enough for Airtable to fetch.
 */
async function uploadToTempHost(buffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(buffer)]), filename);

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`tmpfiles.org upload failed: ${response.status}`);
  }

  const data = await response.json();
  // Convert display URL → direct download URL
  // https://tmpfiles.org/12345/image.png → https://tmpfiles.org/dl/12345/image.png
  const displayUrl: string = data.data.url;
  return displayUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
}

export class NeuralBeatPipeline {
  /** The live PipelineRun, mutated in place so callers can poll progress. */
  public currentRun: PipelineRun | null = null;

  /** Called after each step update — used by SSE streaming to push progress to client. */
  public onProgress?: (run: PipelineRun) => void;

  async execute(songRecord: AirtableSongRecord): Promise<PipelineRun> {
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
    let airtableImageUrl: string | null = null;
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
        // Validate the audio URL is accessible
        const response = await fetch(audioUrl, { method: 'HEAD' });
        if (!response.ok) {
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

      // Step 5: HYBRID — Generate AI images (unique) + Fetch Airtable genre images
      // AI images are unique to the song's mood/style, Airtable images add visual variety
      // Both run in PARALLEL to minimize total time
      currentStepIndex = 4;
      stepRunning(steps[currentStepIndex]);
      try {
        const imageGenre = songAnalysis!.imageGenre || 'dance';
        const imgTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nb-images-'));

        steps[currentStepIndex].result = `Generating AI images + fetching "${imageGenre}" from Airtable...`;
        notify();

        // Run AI generation and Airtable fetch in PARALLEL for speed
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
          // 2. Fetch 15 genre images from Airtable
          getGenreImages(imageGenre, 15).catch(err => {
            console.warn(`[NeuralBeatPipeline] Airtable image fetch failed (non-fatal): ${err instanceof Error ? err.message : err}`);
            return [] as Awaited<ReturnType<typeof getGenreImages>>;
          }),
        ]);

        console.log(`[NeuralBeatPipeline] AI: ${aiResult.images.length} images, Airtable: ${genreImages.length} images`);
        steps[currentStepIndex].result = `AI: ${aiResult.images.length}, Airtable: ${genreImages.length} images — downloading...`;
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
        // Save reference for step 8 (save back to Airtable for reuse)
        aiImageLocalPaths = aiImagePaths;

        // Download Airtable images to temp files (parallel)
        const downloadPromises = genreImages.map(async (img, i) => {
          const imgPath = path.join(imgTempDir, `genre-${i}.jpg`);
          try {
            const response = await fetch(img.imageUrl);
            if (!response.ok) {
              console.warn(`[NeuralBeatPipeline] Airtable image ${i} download failed: ${response.status}`);
              return null;
            }
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(imgPath, buffer);
            return imgPath;
          } catch {
            return null;
          }
        });
        const airtableImagePaths = (await Promise.all(downloadPromises)).filter((p): p is string => p !== null);

        const totalImages = aiImagePaths.length + airtableImagePaths.length;
        if (totalImages === 0) {
          throw new Error(`No images available from AI generation or Airtable genre "${imageGenre}". Cannot create video.`);
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
          } else if (atIdx < airtableImagePaths.length) {
            allPaths.push(airtableImagePaths[atIdx++]);
          } else if (aiIdx < aiImagePaths.length) {
            allPaths.push(aiImagePaths[aiIdx++]);
          }
        }
        // Add any remaining images
        while (aiIdx < aiImagePaths.length) allPaths.push(aiImagePaths[aiIdx++]);
        while (atIdx < airtableImagePaths.length) allPaths.push(airtableImagePaths[atIdx++]);

        localImagePaths = allPaths;

        // Use first AI image as YouTube thumbnail (most unique), fallback to Airtable
        if (aiResult.images.length > 0) {
          thumbnailBuffer = Buffer.from(aiResult.images[0].base64, 'base64');
          airtableImageUrl = genreImages.length > 0 ? genreImages[0].imageUrl : null;
        } else if (genreImages.length > 0) {
          try {
            const thumbResponse = await fetch(genreImages[0].imageUrl);
            if (thumbResponse.ok) {
              thumbnailBuffer = Buffer.from(await thumbResponse.arrayBuffer());
            }
          } catch {
            console.warn('[NeuralBeatPipeline] Could not download thumbnail (non-fatal)');
          }
          airtableImageUrl = genreImages[0].imageUrl;
        }

        console.log(`[NeuralBeatPipeline] ${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${airtableImagePaths.length} Airtable)`);
        steps[currentStepIndex].result = `${localImagePaths.length} images ready (${aiImagePaths.length} AI + ${airtableImagePaths.length} Airtable)`;

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
        const renderResult = await renderVideo({
          audioUrl: audioUrl!,
          imagePaths: localImagePaths,
          title: songRecord.title,
          subtitle: songRecord.artist,
          onSegmentProgress: (current, total) => {
            // Update step result with segment progress to keep SSE alive
            steps[currentStepIndex].result = `Encoding segment ${current}/${total}`;
            notify();
          },
        });
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

        // Try to set custom thumbnail (requires channel verification)
        if (thumbnailBuffer) {
          try {
            await setThumbnail(uploadResult.videoId, thumbnailBuffer);
            console.log('[NeuralBeatPipeline] Custom thumbnail set successfully');
          } catch (e) {
            console.warn('[NeuralBeatPipeline] Could not set custom thumbnail (non-fatal):', e);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 7 failed: ${message}`);
      }

      // Step 8: Update Airtable with YouTube URL, AI Metadata, and Generated Image
      //         + Save AI-generated images back to Genre Images table for reuse
      currentStepIndex = 7;
      stepRunning(steps[currentStepIndex]);
      try {
        await updateSongFields(songRecord.id, {
          youtubeUrl: youtubeUrl!,
          aiMetadata: {
            genre: songAnalysis!.genre,
            style: songAnalysis!.style,
            mood: songAnalysis!.mood,
            bpm: (songAnalysis as any)?.bpm,
            youtubeTitle: youtubeMetadata!.title,
            youtubeDescription: youtubeMetadata!.description,
            tags: youtubeMetadata!.tags,
            renderer: 'ffmpeg',
            processedAt: new Date().toISOString(),
          },
          ...(airtableImageUrl ? { imageUrl: airtableImageUrl } : {}),
        });

        // Save AI-generated images back to the Genre Images table for future reuse.
        // This grows the image library automatically — each song contributes unique
        // AI images that future songs can randomly pick from.
        if (aiImageLocalPaths.length > 0 && usedImageGenre) {
          try {
            console.log(`[NeuralBeatPipeline] Saving ${aiImageLocalPaths.length} AI images to genre library "${usedImageGenre}"...`);
            steps[currentStepIndex].result = `Saving ${aiImageLocalPaths.length} AI images to genre library...`;
            notify();

            // Upload AI images to tmpfiles.org in parallel to get public URLs
            const uploadPromises = aiImageLocalPaths.map(async (imgPath, i) => {
              try {
                const buffer = await fs.readFile(imgPath);
                const filename = `ai-${usedImageGenre}-${Date.now()}-${i}.png`;
                const url = await uploadToTempHost(buffer, filename);
                console.log(`[NeuralBeatPipeline] Uploaded AI image ${i + 1}/${aiImageLocalPaths.length} → ${url.substring(0, 60)}...`);
                return url;
              } catch (err) {
                console.warn(`[NeuralBeatPipeline] Failed to upload AI image ${i}: ${err instanceof Error ? err.message : err}`);
                return null;
              }
            });

            const uploadedUrls = (await Promise.all(uploadPromises)).filter((u): u is string => u !== null);

            if (uploadedUrls.length > 0) {
              // Create a single Airtable record with all AI images as attachments.
              // Airtable downloads from the temp URLs and stores permanently.
              await saveGeneratedImagesToGenreLibrary(usedImageGenre, uploadedUrls);
              console.log(`[NeuralBeatPipeline] Saved ${uploadedUrls.length} AI images to "${usedImageGenre}" genre library`);
            }
          } catch (err) {
            // Non-fatal: the video is already uploaded, this is just a bonus
            console.warn(`[NeuralBeatPipeline] Failed to save AI images to genre library (non-fatal): ${err instanceof Error ? err.message : err}`);
          }
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Step 8 failed: ${message}`);
      }

      // Pipeline completed successfully
      pipelineRun.status = 'completed';
      pipelineRun.completedAt = new Date().toISOString();
      pipelineRun.output = {
        youtubeUrl,
        songAnalysis,
        youtubeMetadata,
        localImagePaths,
        airtableImageUrl,
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

      // Try to write error info to Airtable AI Metadata field (graceful)
      try {
        await updateSongFields(songRecord.id, {
          aiMetadata: {
            error: pipelineRun.error,
            failedAt: new Date().toISOString(),
            lastStep: steps[currentStepIndex]?.name,
          },
        });
      } catch (airtableError) {
        console.error(
          '[NeuralBeatPipeline] Failed to update Airtable error metadata:',
          airtableError
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
