import { publishToMultiplePlatforms, publishToYouTube } from '@/services/integrations/social-publisher';
import type { PipelineRun, PipelineStep } from '@/lib/types';
import { generateId } from '@/lib/utils';
import { createServerClient } from '@/lib/supabase/server';

// ─── Interfaces ─────────────────────────────────────────────────────

export interface ContentPublishInput {
  brandId: string;
  contentType: 'video' | 'slideshow' | 'post' | 'reel' | 'story' | 'article';
  platforms: ('youtube' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'pinterest')[];
  // Content source
  title: string;
  description?: string;
  mediaUrls?: string[]; // images or video URLs
  mediaFile?: Buffer; // uploaded file
  audioUrl?: string; // for slideshow with music
  // AI generation options
  generateTitle?: boolean;
  generateDescription?: boolean;
  generateTags?: boolean;
  generateImage?: boolean;
  generateVideo?: boolean; // create slideshow from images
  // Brand context
  brandTone?: string;
  targetAudience?: string;
  language?: string;
  // Publishing
  privacyStatus?: 'public' | 'unlisted' | 'private';
  scheduledAt?: string;
}

export interface ContentPublishOutput {
  youtubeUrl?: string;
  youtubeVideoId?: string;
  instagramPostId?: string;
  facebookPostId?: string;
  linkedinPostId?: string;
  tiktokPostId?: string;
  pinterestPinId?: string;
  generatedTitle?: string;
  generatedDescription?: string;
  generatedTags?: string[];
  generatedImageUrl?: string;
  publicationId?: string;
}

// ─── Pipeline Step Helpers ──────────────────────────────────────────

const STEP_NAMES = [
  'Valider input',
  'AI-innholdsgenerering',
  'Bildegenerering',
  'Videorendering',
  'YouTube-publisering',
  'Sosiale medier-publisering',
  'Lagre resultater',
  'Oppfølgingskampanje',
] as const;

function createStep(name: string): PipelineStep {
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

// ─── Content Publishing Pipeline ────────────────────────────────────

export class ContentPublishingPipeline {
  /** The live PipelineRun, mutated in place so callers can poll progress. */
  public currentRun: PipelineRun | null = null;

  /** Called after each step update - used by SSE streaming to push progress to client. */
  public onProgress?: (run: PipelineRun) => void;

  async execute(input: ContentPublishInput): Promise<PipelineRun> {
    console.log(`[ContentPipeline] Starting pipeline for "${input.title}" (${input.contentType}) -> [${input.platforms.join(', ')}]`);

    const steps: PipelineStep[] = STEP_NAMES.map((name) => createStep(name));

    const pipelineRun: PipelineRun = {
      id: generateId(),
      type: 'brand-video' as const,
      status: 'running',
      steps,
      input: { ...input, mediaFile: input.mediaFile ? '[Buffer]' : undefined },
      output: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    this.currentRun = pipelineRun;

    const notify = () => this.onProgress?.(pipelineRun);

    const stepRunning = (s: PipelineStep) => { markStepRunning(s); notify(); };
    const stepCompleted = (s: PipelineStep) => { markStepCompleted(s); notify(); };
    const stepFailed = (s: PipelineStep, err: string) => { markStepFailed(s, err); notify(); };
    const stepSkipped = (s: PipelineStep) => { markStepSkipped(s); notify(); };

    let currentStepIndex = 0;

    const output: ContentPublishOutput = {};
    let generatedTitle: string | undefined;
    let generatedDescription: string | undefined;
    let generatedTags: string[] | undefined;
    let generatedImageUrl: string | undefined;
    let videoBuffer: Buffer | null = input.mediaFile || null;

    try {
      // ─── Step 1: Validate Input ─────────────────────────────────────
      currentStepIndex = 0;
      stepRunning(steps[currentStepIndex]);
      try {
        if (!input.brandId) throw new Error('brandId er påkrevd');
        if (!input.title && !input.generateTitle) throw new Error('title er påkrevd når generateTitle ikke er aktivert');
        if (!input.platforms || input.platforms.length === 0) throw new Error('Minst én plattform må velges');

        // Validate content type has appropriate media
        if (['video', 'slideshow'].includes(input.contentType)) {
          const hasMedia = input.mediaFile || input.mediaUrls?.length || input.generateVideo;
          if (!hasMedia) {
            throw new Error(`Innholdstype "${input.contentType}" krever enten mediaFile, mediaUrls eller generateVideo=true`);
          }
        }

        steps[currentStepIndex].result = `Validert: ${input.contentType} for ${input.platforms.join(', ')}`;
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stepFailed(steps[currentStepIndex], message);
        throw new Error(`Steg 1 feilet: ${message}`);
      }

      // ─── Step 2: AI Content Generation ──────────────────────────────
      currentStepIndex = 1;
      if (input.generateTitle || input.generateDescription || input.generateTags) {
        stepRunning(steps[currentStepIndex]);
        try {
          const { AgentOrchestrator } = await import('@/services/agents/orchestrator');
          const orchestrator = new AgentOrchestrator();

          const prompt = `Generer innhold for en ${input.contentType} for brand "${input.brandId}".
Tittel/tema: ${input.title || 'Ikke spesifisert'}
${input.description ? `Beskrivelse: ${input.description}` : ''}
${input.brandTone ? `Tone: ${input.brandTone}` : ''}
${input.targetAudience ? `Målgruppe: ${input.targetAudience}` : ''}
Plattformer: ${input.platforms.join(', ')}
Språk: ${input.language || 'norsk'}

Returner KUN gyldig JSON:
{
  ${input.generateTitle ? '"title": "optimalisert tittel",' : ''}
  ${input.generateDescription ? '"description": "engasjerende beskrivelse tilpasset plattformene",' : ''}
  ${input.generateTags ? '"tags": ["tag1", "tag2", "tag3"]' : ''}
}`;

          const result = await orchestrator.executeCommand('marketing', prompt);

          if (result.status === 'success') {
            try {
              // Try to parse JSON from the response
              const jsonMatch = result.output.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (input.generateTitle && parsed.title) {
                  generatedTitle = parsed.title;
                  output.generatedTitle = generatedTitle;
                }
                if (input.generateDescription && parsed.description) {
                  generatedDescription = parsed.description;
                  output.generatedDescription = generatedDescription;
                }
                if (input.generateTags && parsed.tags) {
                  generatedTags = parsed.tags;
                  output.generatedTags = generatedTags;
                }
              }
            } catch {
              console.warn('[ContentPipeline] Could not parse AI JSON, using raw output');
              if (input.generateDescription) {
                generatedDescription = result.output;
                output.generatedDescription = generatedDescription;
              }
            }
          }

          steps[currentStepIndex].result = `Generert: ${[
            generatedTitle ? 'tittel' : null,
            generatedDescription ? 'beskrivelse' : null,
            generatedTags ? `${generatedTags.length} tags` : null,
          ].filter(Boolean).join(', ') || 'ingen'}`;

          stepCompleted(steps[currentStepIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Non-fatal: continue with original content
          console.warn(`[ContentPipeline] AI generation failed (non-fatal): ${message}`);
          steps[currentStepIndex].result = `AI-generering feilet (ikke-kritisk): ${message}`;
          stepCompleted(steps[currentStepIndex]);
        }
      } else {
        stepSkipped(steps[currentStepIndex]);
      }

      // ─── Step 3: Image Generation ──────────────────────────────────
      currentStepIndex = 2;
      if (input.generateImage) {
        stepRunning(steps[currentStepIndex]);
        try {
          const { GeminiService } = await import('@/services/ai/gemini-service');
          const gemini = new GeminiService();

          const imagePrompt = `Profesjonelt markedsføringsbilde for ${input.brandId}: ${input.title}. ${input.brandTone || 'Profesjonell og moderne stil'}.`;
          const result = await gemini.generateMarketingImage(imagePrompt);

          if (result && typeof result === 'object' && 'imageUrl' in result) {
            generatedImageUrl = (result as { imageUrl: string }).imageUrl;
            output.generatedImageUrl = generatedImageUrl;
          }

          steps[currentStepIndex].result = generatedImageUrl
            ? 'Bilde generert'
            : 'Bildegenerering fullført men ingen URL returnert';
          stepCompleted(steps[currentStepIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[ContentPipeline] Image generation failed (non-fatal): ${message}`);
          steps[currentStepIndex].result = `Bildegenerering feilet (ikke-kritisk): ${message}`;
          stepCompleted(steps[currentStepIndex]);
        }
      } else {
        stepSkipped(steps[currentStepIndex]);
      }

      // ─── Step 4: Video Rendering ───────────────────────────────────
      currentStepIndex = 3;
      if (input.generateVideo && input.mediaUrls && input.mediaUrls.length > 0) {
        stepRunning(steps[currentStepIndex]);
        try {
          const { renderVideo, isAvailable } = await import('@/services/integrations/ffmpeg-renderer');

          const ffmpegOk = await isAvailable();
          if (!ffmpegOk) {
            throw new Error('FFmpeg er ikke installert. Kan ikke rendere video.');
          }

          // Download images to temp files
          const fs = await import('fs/promises');
          const path = await import('path');
          const os = await import('os');
          const imgTempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pipeline-'));

          const imagePaths: string[] = [];
          for (let i = 0; i < input.mediaUrls.length; i++) {
            const url = input.mediaUrls[i];
            try {
              const response = await fetch(url);
              if (response.ok) {
                const buffer = Buffer.from(await response.arrayBuffer());
                const imgPath = path.join(imgTempDir, `img-${i}.jpg`);
                await fs.writeFile(imgPath, buffer);
                imagePaths.push(imgPath);
              }
            } catch {
              console.warn(`[ContentPipeline] Failed to download image ${i}: ${url}`);
            }
          }

          if (imagePaths.length === 0) {
            throw new Error('Ingen bilder kunne lastes ned for videorendering');
          }

          const renderResult = await renderVideo({
            audioUrl: input.audioUrl || '',
            imagePaths,
            title: generatedTitle || input.title,
            subtitle: input.brandId,
            onSegmentProgress: (current, total) => {
              steps[currentStepIndex].result = `Rendrer segment ${current}/${total}`;
              notify();
            },
          });

          videoBuffer = renderResult.videoBuffer;
          steps[currentStepIndex].result = `Video rendret: ${(renderResult.videoBuffer.length / 1024 / 1024).toFixed(1)} MB`;

          // Cleanup
          try {
            await fs.rm(imgTempDir, { recursive: true });
          } catch {
            // ignore cleanup errors
          }

          stepCompleted(steps[currentStepIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stepFailed(steps[currentStepIndex], message);
          throw new Error(`Steg 4 feilet: ${message}`);
        }
      } else {
        stepSkipped(steps[currentStepIndex]);
      }

      // ─── Step 5: YouTube Publish ───────────────────────────────────
      currentStepIndex = 4;
      if (input.platforms.includes('youtube') && videoBuffer) {
        stepRunning(steps[currentStepIndex]);
        try {
          const result = await publishToYouTube({
            video: videoBuffer,
            title: generatedTitle || input.title,
            description: generatedDescription || input.description || '',
            tags: generatedTags || [],
            privacyStatus: input.privacyStatus || 'private',
            language: input.language || 'no',
          });

          if (result.success) {
            output.youtubeUrl = result.postUrl;
            output.youtubeVideoId = result.postId;
            steps[currentStepIndex].result = `Lastet opp: ${result.postUrl}`;
          } else {
            steps[currentStepIndex].result = `YouTube-feil: ${result.error}`;
          }

          stepCompleted(steps[currentStepIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stepFailed(steps[currentStepIndex], message);
          // Non-fatal: continue with other platforms
          console.warn(`[ContentPipeline] YouTube publish failed: ${message}`);
        }
      } else if (input.platforms.includes('youtube') && !videoBuffer) {
        stepRunning(steps[currentStepIndex]);
        steps[currentStepIndex].result = 'Hoppet over: Ingen video-buffer tilgjengelig for YouTube';
        stepSkipped(steps[currentStepIndex]);
      } else {
        stepSkipped(steps[currentStepIndex]);
      }

      // ─── Step 6: Social Media Publish ──────────────────────────────
      currentStepIndex = 5;
      const socialPlatforms = input.platforms.filter((p) => p !== 'youtube');
      if (socialPlatforms.length > 0) {
        stepRunning(steps[currentStepIndex]);
        try {
          const results = await publishToMultiplePlatforms({
            brandId: input.brandId,
            platforms: socialPlatforms,
            title: generatedTitle || input.title,
            content: generatedDescription || input.description || input.title,
            imageUrl: generatedImageUrl || input.mediaUrls?.[0],
            videoUrl: input.mediaUrls?.find((url) => url.match(/\.(mp4|mov|webm)$/i)),
          });

          const successful = results.filter((r) => r.success);
          const failed = results.filter((r) => !r.success);

          // Map results to output
          for (const result of results) {
            if (result.success && result.postId) {
              switch (result.platform) {
                case 'instagram':
                  output.instagramPostId = result.postId;
                  break;
                case 'facebook':
                  output.facebookPostId = result.postId;
                  break;
                case 'linkedin':
                  output.linkedinPostId = result.postId;
                  break;
                case 'tiktok':
                  output.tiktokPostId = result.postId;
                  break;
                case 'pinterest':
                  output.pinterestPinId = result.postId;
                  break;
              }
            }
          }

          steps[currentStepIndex].result = `Publisert: ${successful.length} OK, ${failed.length} feilet av ${socialPlatforms.length} plattformer`;
          stepCompleted(steps[currentStepIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[ContentPipeline] Social publish failed: ${message}`);
          steps[currentStepIndex].result = `Sosiale medier-feil: ${message}`;
          stepCompleted(steps[currentStepIndex]);
        }
      } else {
        stepSkipped(steps[currentStepIndex]);
      }

      // ─── Step 7: Save Results ──────────────────────────────────────
      currentStepIndex = 6;
      stepRunning(steps[currentStepIndex]);
      try {
        const supabase = createServerClient();

        const { data, error } = await supabase
          .from('content_publications')
          .insert({
            brand_id: input.brandId,
            content_type: input.contentType,
            title: generatedTitle || input.title,
            description: generatedDescription || input.description,
            tags: generatedTags || [],
            media_urls: input.mediaUrls || [],
            youtube_url: output.youtubeUrl,
            youtube_video_id: output.youtubeVideoId,
            instagram_post_id: output.instagramPostId,
            facebook_post_id: output.facebookPostId,
            linkedin_post_id: output.linkedinPostId,
            tiktok_post_id: output.tiktokPostId,
            pinterest_pin_id: output.pinterestPinId,
            ai_generated: !!(input.generateTitle || input.generateDescription || input.generateTags),
            ai_title: output.generatedTitle,
            ai_description: output.generatedDescription,
            ai_tags: output.generatedTags,
            ai_image_url: output.generatedImageUrl,
            status: 'published',
            published_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) {
          console.warn(`[ContentPipeline] Supabase save failed (non-fatal): ${error.message}`);
          steps[currentStepIndex].result = `Database-lagring feilet: ${error.message}`;
        } else {
          output.publicationId = data.id;
          steps[currentStepIndex].result = `Lagret i database: ${data.id}`;
        }

        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ContentPipeline] Save results failed (non-fatal): ${message}`);
        steps[currentStepIndex].result = `Lagring feilet (ikke-kritisk): ${message}`;
        stepCompleted(steps[currentStepIndex]);
      }

      // ─── Step 8: Follow-up Campaign ───────────────────────────────
      currentStepIndex = 7;
      stepRunning(steps[currentStepIndex]);
      try {
        // Generate follow-up suggestions using the CEO agent
        const { AgentOrchestrator } = await import('@/services/agents/orchestrator');
        const orchestrator = new AgentOrchestrator();

        const followUpPrompt = `Innhold publisert for "${input.brandId}":
Tittel: ${generatedTitle || input.title}
Type: ${input.contentType}
Plattformer: ${input.platforms.join(', ')}
YouTube URL: ${output.youtubeUrl || 'Ikke publisert'}

Foreslå 3 oppfølgingshandlinger for å maksimere rekkevidden av dette innholdet.
Inkluder spesifikke poster for andre plattformer som kan referere til dette innholdet.
Hold svaret kort og handlingsbart.`;

        const ceoAgent = orchestrator.getAgent('ceo');
        let followUpResult: string;

        if (ceoAgent) {
          const taskResults = await ceoAgent.executeTasks([{
            id: generateId(),
            name: 'delegate_tasks',
            description: followUpPrompt,
            priority: 'medium',
            parameters: {
              goal: followUpPrompt,
              brandId: input.brandId,
            },
            status: 'pending',
          }]);
          followUpResult = taskResults[0]?.output || 'Ingen oppfølging generert';
        } else {
          // Fallback to marketing agent
          const result = await orchestrator.executeCommand('marketing', followUpPrompt);
          followUpResult = result.output;
        }

        steps[currentStepIndex].result = `Oppfølgingsplan generert (${followUpResult.length} tegn)`;
        stepCompleted(steps[currentStepIndex]);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ContentPipeline] Follow-up campaign failed (non-fatal): ${message}`);
        steps[currentStepIndex].result = `Oppfølging hoppet over: ${message}`;
        stepCompleted(steps[currentStepIndex]);
      }

      // Pipeline completed
      pipelineRun.status = 'completed';
      pipelineRun.completedAt = new Date().toISOString();
      pipelineRun.output = output;
      notify();
    } catch (error) {
      // Mark remaining steps as skipped
      for (let i = currentStepIndex + 1; i < steps.length; i++) {
        if (steps[i].status === 'pending') {
          stepSkipped(steps[i]);
        }
      }

      pipelineRun.status = 'failed';
      pipelineRun.completedAt = new Date().toISOString();
      pipelineRun.error = error instanceof Error ? error.message : String(error);
      notify();
    }

    return pipelineRun;
  }
}
