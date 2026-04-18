import { GoogleGenerativeAI } from '@google/generative-ai';
import { askClaude } from '@/services/ai/claude-client';

// ─── Gemini client (ONLY for image generation) ──────────────────────

let genAI: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured (needed for image generation)');
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Race a promise against a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms / 1000}s: ${label}`)), ms);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

// ─── Image Generation (Gemini) ──────────────────────────────────────

/**
 * Generate an image using Google Gemini's image generation capabilities.
 * This is the ONLY function that uses Gemini — all text tasks use Claude.
 */
export async function generateImage(
  prompt: string,
  options?: {
    style?: string;
    aspectRatio?: '1:1' | '16:9' | '9:16';
  }
): Promise<{ base64: string; mimeType: string }> {
  const client = getGeminiClient();

  const enhancedPrompt = options?.style
    ? `${prompt}. Style: ${options.style}. Aspect ratio: ${options.aspectRatio || '16:9'}`
    : `${prompt}. Aspect ratio: ${options?.aspectRatio || '16:9'}`;

  const model = client.getGenerativeModel({ model: 'gemini-2.5-flash-image' });

  const result = await withTimeout(
    model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Generate an image: ${enhancedPrompt}` }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'] as any,
      } as any,
    }),
    60_000,
    'Gemini image generation',
  );

  const response = result.response;
  const parts = response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if ((part as any).inlineData) {
      return {
        base64: (part as any).inlineData.data,
        mimeType: (part as any).inlineData.mimeType || 'image/png',
      };
    }
  }

  throw new Error('Gemini did not return an image in the response');
}

// ─── Text Tasks (Claude Haiku) ──────────────────────────────────────

/**
 * Generate a music cover image using Claude for prompt + Gemini for image.
 */
export async function generateMusicCoverImage(
  options: {
    title: string;
    artist?: string;
    genre?: string;
    style?: string;
    mood?: string;
    imagePrompt?: string;
    bpm?: number;
  }
): Promise<{ imageUrl: string; base64: string; mimeType: string; prompt: string }> {
  let imagePrompt = options.imagePrompt;

  if (!imagePrompt) {
    const analysisPrompt = `You are a creative art director for music visuals.

Create a visually striking image description for a music video cover/thumbnail:

Title: "${options.title}"
${options.genre ? `Genre: ${options.genre}` : ''}
${options.mood ? `Mood: ${options.mood}` : ''}
${options.style ? `Style: ${options.style}` : ''}
${options.bpm ? `BPM: ${options.bpm}` : ''}
${options.artist ? `Artist: ${options.artist}` : ''}

Create a detailed image prompt (in English) that:
1. Matches the music's energy and mood
2. Is visually dramatic and eye-catching for YouTube
3. Uses neon colors, abstract shapes, or futuristic elements for EDM
4. Does NOT contain text, logos, or faces
5. Is optimized for 16:9 YouTube thumbnail

Reply ONLY with the image prompt text, no explanation.`;

    imagePrompt = await askClaude(analysisPrompt, { temperature: 0.8, maxTokens: 500 });
  }

  // Generate the image with Gemini
  const image = await generateImage(imagePrompt.trim(), {
    style: 'cinematic digital art, vibrant neon colors, high contrast',
    aspectRatio: '16:9',
  });

  const imageUrl = `data:${image.mimeType};base64,${image.base64}`;
  return { ...image, prompt: imagePrompt.trim(), imageUrl };
}

// ─── Mood-based visual theme mapping for multi-image generation ────────
const MOOD_VISUAL_THEMES: Record<string, string[]> = {
  romantic: [
    'golden sunset over calm ocean with silhouetted couple on beach',
    'candlelit room with soft bokeh lights and rose petals',
    'starry night sky reflected in a still mountain lake',
    'cherry blossom trees along a serene garden path',
    'warm sunrise through sheer curtains in a modern apartment',
    'vintage car driving along coastal highway at dusk',
    'soft rain on city windows with warm interior lights',
    'tropical island beach with crystal clear turquoise water',
    'hot air balloons over lavender fields at golden hour',
    'moonlit rooftop terrace overlooking a sparkling city',
  ],
  chill: [
    'misty forest with soft morning light filtering through trees',
    'minimalist zen garden with raked sand patterns',
    'calm lake at dawn with mountains reflected in water',
    'cozy reading nook with warm ambient lighting',
    'slow-motion waves breaking on an empty sandy beach',
    'japanese tea ceremony room with bamboo and natural light',
    'aerial view of winding river through autumn forest',
    'soft clouds drifting over snow-capped mountain peaks',
    'underwater view of coral reef with gentle fish movements',
    'hammock between palm trees overlooking turquoise lagoon',
  ],
  energetic: [
    'neon-lit cyberpunk city skyline at night with rain',
    'electric laser light show in a massive concert venue',
    'speed blur of sports car driving through neon tunnel',
    'dynamic aerial view of a pulsing EDM festival crowd',
    'abstract neon circuit board with glowing data streams',
    'futuristic dance floor with holographic projections',
    'lightning storm over a modern glass skyscraper city',
    'extreme close-up of turntable with neon reflections',
    'high-speed motion blur of motorcycle through tokyo streets',
    'explosive burst of colorful powder and neon particles',
  ],
  dark: [
    'dramatic thunderstorm with purple lightning over ocean',
    'abandoned industrial warehouse with moody atmospheric fog',
    'dark forest path illuminated by a single beam of moonlight',
    'abstract dark art with deep red and black smoke swirls',
    'dystopian cityscape with towering dark buildings and neon accents',
    'underwater deep sea scene with bioluminescent creatures',
    'smoky underground club with minimal red laser lighting',
    'volcanic landscape with flowing lava and dark sky',
    'gothic cathedral interior with dramatic stained glass light',
    'dark nebula in space with stars and cosmic dust',
  ],
  happy: [
    'vibrant tropical sunset with colorful sky and palm trees',
    'festival crowd with confetti and colorful stage lights',
    'bright flower field with butterflies and blue sky',
    'colorful hot air balloons floating over rolling green hills',
    'beach party scene with tiki torches and string lights',
    'aerial view of colorful coral reef in crystal water',
    'vibrant street market with colorful lanterns and decorations',
    'rainbow over a waterfall in lush tropical jungle',
    'golden hour skateboard park with warm cinematic light',
    'fireworks display over city waterfront at night',
  ],
  euphoric: [
    'massive EDM festival stage with pyrotechnics and lasers',
    'aurora borealis dancing over snow-covered mountains',
    'golden sunrise breaking through dramatic cloud formations',
    'aerial view of endless desert sand dunes at golden hour',
    'cosmic nebula explosion with vibrant pink and blue colors',
    'mountain peak above the clouds at sunrise',
    'speed blur through a tunnel of colorful neon lights',
    'crystal cave with rainbow light refractions',
    'panoramic view from space station of earth and stars',
    'massive ocean wave frozen in time with golden light',
  ],
};

/**
 * Get the mood category for visual theme selection.
 */
function getMoodCategory(mood: string, energy: string): string {
  const moodLower = mood.toLowerCase();
  if (moodLower.includes('romantic') || moodLower.includes('love') || moodLower.includes('sensual')) return 'romantic';
  if (moodLower.includes('chill') || moodLower.includes('relax') || moodLower.includes('calm') || moodLower.includes('ambient')) return 'chill';
  if (moodLower.includes('dark') || moodLower.includes('intense') || moodLower.includes('aggressive') || moodLower.includes('heavy')) return 'dark';
  if (moodLower.includes('happy') || moodLower.includes('upbeat') || moodLower.includes('fun') || moodLower.includes('cheerful')) return 'happy';
  if (moodLower.includes('euphoric') || moodLower.includes('uplifting') || moodLower.includes('epic')) return 'euphoric';
  if (energy === 'high') return 'energetic';
  if (energy === 'low') return 'chill';
  return 'energetic';
}

/**
 * Generate a set of cover images for a music video slideshow.
 * Uses Gemini for image generation only.
 */
export async function generateMusicImageSet(
  options: {
    title: string;
    artist?: string;
    genre?: string;
    style?: string;
    mood?: string;
    energy?: string;
    visualStyle?: string;
    count?: number;
  }
): Promise<{ images: Array<{ base64: string; mimeType: string; prompt: string }> }> {
  const count = Math.min(options.count || 8, 10);
  const moodCategory = getMoodCategory(options.mood || 'energetic', options.energy || 'high');
  const themes = MOOD_VISUAL_THEMES[moodCategory] || MOOD_VISUAL_THEMES.energetic;

  const selectedThemes = Array.from({ length: count }, (_, i) => themes[i % themes.length]);

  const enhancedPrompts = selectedThemes.map((theme) =>
    `${theme}. ${options.genre ? `Feeling of ${options.genre} music.` : ''} ${options.visualStyle ? `Visual style: ${options.visualStyle}.` : ''} Cinematic, atmospheric, no text or faces, 16:9 aspect ratio.`
  );

  console.log(`[ImageGen] Generating ${count} images for mood: ${moodCategory} (Gemini)`);

  const batchSize = 2;
  const results: Array<{ base64: string; mimeType: string; prompt: string }> = [];
  let consecutiveFailures = 0;

  for (let i = 0; i < enhancedPrompts.length; i += batchSize) {
    if (results.length >= 3 && consecutiveFailures >= 2) {
      console.warn(`[ImageGen] Stopping early with ${results.length} images after ${consecutiveFailures} consecutive failures`);
      break;
    }

    const batch = enhancedPrompts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(enhancedPrompts.length / batchSize);
    console.log(`[ImageGen] Batch ${batchNum}/${totalBatches} (${batch.length} images)...`);

    const batchStartTime = Date.now();
    const batchResults = await Promise.all(
      batch.map(async (prompt, batchIndex) => {
        const imgNum = i + batchIndex + 1;
        try {
          const startMs = Date.now();
          const image = await generateImage(prompt, {
            style: 'cinematic photography, high contrast, dramatic lighting',
            aspectRatio: '16:9',
          });
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
          console.log(`[ImageGen] Image ${imgNum}/${count} generated (${elapsed}s)`);
          consecutiveFailures = 0;
          return { ...image, prompt };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[ImageGen] Image ${imgNum} failed: ${errMsg}`);

          await new Promise((resolve) => setTimeout(resolve, 2000));
          try {
            const image = await generateImage(prompt, {
              style: 'cinematic digital art, vibrant colors',
              aspectRatio: '16:9',
            });
            console.log(`[ImageGen] Image ${imgNum} succeeded on retry`);
            consecutiveFailures = 0;
            return { ...image, prompt };
          } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            console.error(`[ImageGen] Image ${imgNum} failed permanently: ${retryMsg}`);
            consecutiveFailures++;
            return null;
          }
        }
      })
    );

    const succeeded = batchResults.filter((r): r is NonNullable<typeof r> => r !== null);
    results.push(...succeeded);

    const batchElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    console.log(`[ImageGen] Batch ${batchNum} done: ${succeeded.length}/${batch.length} succeeded (${batchElapsed}s). Total: ${results.length}/${count}`);

    if (i + batchSize < enhancedPrompts.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  if (results.length === 0) {
    throw new Error('Failed to generate any images. Check Gemini API key and rate limits.');
  }

  if (results.length < 3) {
    console.warn(`[ImageGen] Only ${results.length} images generated (minimum 3 recommended)`);
  }

  console.log(`[ImageGen] Successfully generated ${results.length}/${count} images`);
  return { images: results };
}

// ─── Song Analysis & YouTube SEO (Claude Haiku) ─────────────────────

/**
 * Analyze a song's characteristics using Claude Haiku.
 * Fast, cheap, high-quality text analysis.
 */
export async function analyzeSong(
  options: {
    title: string;
    artist?: string;
    audioUrl?: string;
    metadata?: Record<string, any>;
  }
): Promise<{
  genre: string;
  subGenre: string;
  style: string;
  mood: string;
  energy: 'low' | 'medium' | 'high';
  visualStyle: string;
  targetAudience: string;
  imageGenre: string;
}> {
  const metadata = options.metadata;
  const prompt = `You are a music analyst specialized in EDM and electronic music.
Analyze this song based on the available information and respond in valid JSON only.

Title: "${options.title}"
${options.artist ? `Artist: ${options.artist}` : ''}
${metadata?.genre ? `Assumed genre: ${metadata.genre}` : ''}
${metadata?.mood ? `Assumed mood: ${metadata.mood}` : ''}
${metadata?.bpm ? `BPM: ${metadata.bpm}` : ''}

Respond with ONLY this JSON structure, no markdown:
{
  "genre": "main genre",
  "subGenre": "sub genre",
  "style": "music style (e.g., progressive, minimal, melodic)",
  "mood": "mood (e.g., euphoric, dark, chill, energetic)",
  "energy": "low|medium|high",
  "visualStyle": "description of visual style that fits the music",
  "targetAudience": "target audience for this type of music",
  "imageGenre": "MUST be exactly one of: romantic, sensual, rock, pop, dance, dream, nostalgic, training — pick the best visual category for this song's mood and energy"
}`;

  const result = await askClaude(prompt, { temperature: 0.3, maxTokens: 500 });

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch {
    // fallback
  }

  return {
    genre: metadata?.genre || 'EDM',
    subGenre: 'Electronic',
    style: 'progressive',
    mood: metadata?.mood || 'energetic',
    energy: 'high',
    visualStyle: 'Neon cyberpunk with abstract geometric shapes',
    targetAudience: 'EDM fans and electronic music lovers',
    imageGenre: 'dance',
  };
}

/**
 * Thumbnail hook variant — text content for a single thumbnail A/B candidate.
 */
export interface ThumbnailHookVariant {
  hook: string;        // 2-4 caps words (big text)
  subtext: string;     // 1-4 words, smaller (accent color)
  stamp?: string;      // optional top-right stamp like "NEW" or "🔥"
}

/**
 * Generate YouTube SEO metadata using Claude Haiku.
 */
export async function generateYouTubeSEO(
  options: {
    title: string;
    artist?: string;
    genre: string;
    style: string;
    mood: string;
  }
): Promise<{
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  privacyStatus: string;
  imagePrompt: string;
  thumbnailVariants: ThumbnailHookVariant[];
}> {
  // Rotate title formulas for variety - don't always use "Artist - Title [Genre]"
  const titleFormulas = [
    `"${options.title}" by Re-Master Freddy - make it mood-first: e.g. "Dreamy Chill Vibes | ${options.title} [${options.genre}]"`,
    `"${options.title}" by Re-Master Freddy - make it use-case first: e.g. "Best ${options.mood} Music for Study & Focus | ${options.title}"`,
    `"${options.title}" by Re-Master Freddy - make it emotional: e.g. "${options.title} - Feel the ${options.mood} Energy | Re-Master Freddy"`,
    `"${options.title}" by Re-Master Freddy - make it trending: e.g. "${options.genre} Mix 2026 | ${options.title} (Official Visualizer)"`,
    `"${options.title}" by Re-Master Freddy - make it playlist-style: e.g. "Late Night ${options.genre} | ${options.title} | Chill Beats to Relax"`,
  ];
  const titleFormula = titleFormulas[Math.floor(Math.random() * titleFormulas.length)];

  const prompt = `You are a YouTube SEO expert for music channels. Generate optimized YouTube metadata for this EDM/electronic track.

Track: "${options.title}"
Artist: ${options.artist || 'Re-Master Freddy'}
Genre: ${options.genre}
Style: ${options.style}
Mood: ${options.mood}

TITLE RULES (CRITICAL for CTR):
- Use this formula variation: ${titleFormula}
- Max 60 characters
- NEVER just do "Artist - Title [Genre]" - that's boring and gets low CTR
- Include a hook: mood, use-case (study, sleep, workout), or emotional trigger
- Use | as separator, NOT just dashes
- Include "Re-Master Freddy" but it doesn't have to be first
- Add 1 relevant emoji if it fits naturally

DESCRIPTION (1500-2500 chars, SEO-optimized):
1. Song intro: name, artist, genre, mood, what makes it special (2-3 engaging sentences)
2. Strong CTA: "🔔 Subscribe for daily ${options.genre} drops! 👍 Like if you feel the vibe! 💬 Comment your mood!"
3. Detect the primary language of the track title and add a CTA in THAT language too
4. ALWAYS add English CTA for international reach
5. Timestamps: 00:00 Start, plus 2-3 estimated section timestamps
6. About section: "Re-Master Freddy creates AI-generated electronic music blending cutting-edge AI with human creativity."
7. Playlist suggestion: "Add this to your ${options.mood} playlist!"
8. Hashtags: #ReMasterFreddy #AIMusic #EDM #ChillBeats #StudyMusic #LoFi #ElectronicMusic plus genre-specific

THUMBNAIL HOOKS (CRITICAL for CTR — this text is burned onto the thumbnail):
- Generate exactly 3 DIFFERENT thumbnail hook variants for A/B testing
- Each variant has a "hook" (2-4 CAPS WORDS, big emotional text — think "DEEP VIBES", "NIGHT DRIVE", "STUDY FLOW", "PURE ENERGY", "4AM MOOD")
- Each variant has a "subtext" (1-4 words, smaller, often genre/use-case — e.g. "Lo-Fi Beats 2026", "Focus Music", "Workout Mix")
- Optionally a "stamp" (short 3-4 char word like "NEW", "🔥", "HOT" — max one of the three variants)
- Make each variant feel genuinely different: one emotional, one use-case, one mystery/curiosity
- Avoid: full sentences, punctuation except emoji, long phrases
- Must match the track mood (${options.mood}) and genre (${options.genre})

Respond with ONLY this JSON, no markdown:
{
  "title": "YouTube video title following the formula above (max 60 chars)",
  "description": "FULL YouTube description as described above",
  "tags": ["tag1", "tag2", "...up to 20 relevant tags including trending search terms"],
  "categoryId": "10",
  "privacyStatus": "public",
  "imagePrompt": "A vivid image prompt for the video thumbnail (abstract, neon, no text/faces)",
  "thumbnailVariants": [
    { "hook": "HOOK TEXT A", "subtext": "subtext a", "stamp": "NEW" },
    { "hook": "HOOK TEXT B", "subtext": "subtext b" },
    { "hook": "HOOK TEXT C", "subtext": "subtext c" }
  ]
}`;

  const result = await askClaude(prompt, { temperature: 0.7, maxTokens: 2000 });

  try {
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.thumbnailVariants) || parsed.thumbnailVariants.length < 3) {
        parsed.thumbnailVariants = buildFallbackThumbnailVariants(options.genre, options.mood);
      }
      return parsed;
    }
  } catch {
    // fallback
  }

  const fallbackDesc = `${options.title} by ${options.artist || 'Re-Master Freddy'}

A ${options.mood} ${options.genre} track with ${options.style} vibes. Let the music take you on a journey.

Enjoying this beat? Hit like and subscribe for daily chill beats! 💬 Comment what vibe you want to hear next!

¿Te gusta este beat? ¡Dale a like y suscríbete para beats chill diarios! 💬 ¡Comenta qué tipo de vibra quieres escuchar la próxima vez!

⏱️ Timestamps
00:00 Start
00:30 Build-up
01:30 Drop

🎵 About Re-Master Freddy
Re-Master Freddy creates AI-generated electronic music blending cutting-edge AI with human creativity. Subscribe for daily drops of chill beats, study music, and EDM bangers!

🏷️ Tags
#ReMasterFreddy #AIMusic #${options.genre.replace(/\s/g, '')} #EDM #ChillBeats #StudyMusic #ElectronicMusic #LoFi`;

  // Rotate fallback titles too
  const fallbackTitles = [
    `${options.title} | ${options.mood} ${options.genre} | Re-Master Freddy`,
    `${options.mood} ${options.genre} Mix | ${options.title} - Re-Master Freddy`,
    `Re-Master Freddy - ${options.title} | Best ${options.genre} 2026`,
    `${options.title} (${options.style}) | ${options.genre} Vibes`,
    `Feel the ${options.mood} | ${options.title} - Re-Master Freddy`,
  ];
  const fallbackTitle = fallbackTitles[Math.floor(Math.random() * fallbackTitles.length)];

  return {
    title: fallbackTitle.slice(0, 60),
    description: fallbackDesc,
    tags: [options.genre, options.mood, options.style, 'EDM', 'Electronic Music', 'Re-Master Freddy', 'AI Music', 'Chill Beats', 'Study Music', 'Lo-Fi', options.title, `${options.genre} 2026`, `${options.mood} music`, 'focus music', 'relaxing beats'],
    categoryId: '10',
    privacyStatus: 'public',
    imagePrompt: `Abstract neon visualization for ${options.genre} music, ${options.mood} mood, vibrant colors, no text`,
    thumbnailVariants: buildFallbackThumbnailVariants(options.genre, options.mood),
  };
}

// ─── Fallback thumbnail hooks — mood × genre heuristic ────────────────
function buildFallbackThumbnailVariants(genre: string, mood: string): ThumbnailHookVariant[] {
  const moodLower = mood.toLowerCase();
  const genreLower = genre.toLowerCase();

  const isChill = moodLower.includes('chill') || moodLower.includes('calm') || moodLower.includes('relax');
  const isEnergetic = moodLower.includes('energetic') || moodLower.includes('power') || moodLower.includes('intense');
  const isRomantic = moodLower.includes('romantic') || moodLower.includes('love');
  const isDark = moodLower.includes('dark') || moodLower.includes('deep');
  const isLofi = genreLower.includes('lofi') || genreLower.includes('lo-fi');
  const isEDM = genreLower.includes('edm') || genreLower.includes('house') || genreLower.includes('techno');

  let pool: ThumbnailHookVariant[];
  if (isLofi || isChill) {
    pool = [
      { hook: 'STUDY FLOW', subtext: 'Lo-Fi Focus Beats', stamp: 'NEW' },
      { hook: 'LATE NIGHT VIBES', subtext: 'Chill Beats 2026' },
      { hook: '3AM MOOD', subtext: 'Relax & Unwind' },
    ];
  } else if (isEnergetic || isEDM) {
    pool = [
      { hook: 'PURE ENERGY', subtext: 'Workout Mix 2026', stamp: 'HOT' },
      { hook: 'NIGHT DRIVE', subtext: `${genre} Vibes` },
      { hook: 'FEEL THE DROP', subtext: 'Festival Mode' },
    ];
  } else if (isRomantic) {
    pool = [
      { hook: 'LOVE MODE', subtext: 'Sensual Beats', stamp: 'NEW' },
      { hook: 'GOLDEN HOUR', subtext: 'Romantic Vibes' },
      { hook: 'SLOW DANCE', subtext: `${genre}` },
    ];
  } else if (isDark) {
    pool = [
      { hook: 'DEEP VIBES', subtext: 'After Hours', stamp: 'HOT' },
      { hook: 'SHADOW MODE', subtext: `Dark ${genre}` },
      { hook: 'MIDNIGHT RUN', subtext: 'Atmospheric Beats' },
    ];
  } else {
    pool = [
      { hook: 'NEW DROP', subtext: `${genre} 2026`, stamp: 'NEW' },
      { hook: 'FEEL IT', subtext: `${mood} Vibes` },
      { hook: 'PRESS PLAY', subtext: 'Daily Beats' },
    ];
  }
  return pool;
}

/**
 * Check if Gemini is configured (for image generation).
 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * @deprecated Use isGeminiConfigured() instead
 */
export function isConfigured(): boolean {
  return isGeminiConfigured();
}
