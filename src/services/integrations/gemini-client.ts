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
3. Shows real-life summer scenes: people, DJs in action, beaches, boats, cars, islands, mountains or romantic vacation places — NOT neon abstractions
4. Does NOT contain text or logos (people are welcome)
5. Is optimized for 16:9 YouTube thumbnail

Reply ONLY with the image prompt text, no explanation.`;

    imagePrompt = await askClaude(analysisPrompt, { temperature: 0.8, maxTokens: 500 });
  }

  // Generate the image with Gemini
  const image = await generateImage(imagePrompt.trim(), {
    style: 'photorealistic cinematic photography, warm summer colors, high contrast',
    aspectRatio: '16:9',
  });

  const imageUrl = `data:${image.mimeType};base64,${image.base64}`;
  return { ...image, prompt: imagePrompt.trim(), imageUrl };
}

// ─── Mood-based visual theme mapping for multi-image generation ────────
const MOOD_VISUAL_THEMES: Record<string, string[]> = {
  romantic: [
    'happy couple walking hand in hand along a golden sunset beach with gentle waves',
    'couple sharing a candlelit dinner on a terrace overlooking the Mediterranean sea',
    'couple on a sailboat deck at sunset, wind in their hair, calm turquoise water',
    'romantic evening in Santorini with white houses, blue domes and a couple watching the sunset',
    'couple in a vintage convertible driving along a coastal highway at dusk',
    'couple dancing barefoot on a tropical island beach under string lights',
    'romantic picnic on a mountain viewpoint overlooking a fjord at golden hour',
    'couple watching hot air balloons rise over lavender fields at sunrise',
    'lovers on a rooftop terrace in Paris with the Eiffel Tower glowing in the evening',
    'couple swimming in a crystal clear lagoon surrounded by palm trees',
  ],
  chill: [
    'young woman relaxing in a hammock between palm trees overlooking a turquoise lagoon',
    'friends lounging on the deck of a white yacht anchored in a calm island bay',
    'man with sunglasses relaxing on a paddleboard on a glassy mountain lake at dawn',
    'beach cafe with people sipping cocktails under parasols by crystal clear water',
    'camper van parked on a cliff with people watching waves break on an empty beach',
    'woman doing yoga on a wooden pier over calm turquoise water at sunrise',
    'friends around a small bonfire on a quiet summer beach at dusk',
    'aerial view of a lone sailboat gliding between green islands in calm water',
    'infinity pool on a hillside with a person floating and mountains in the distance',
    'couple reading in beach chairs under a palm tree on a white sand island',
  ],
  energetic: [
    'DJ in action behind the decks with hands in the air at a packed beach club at sunset',
    'sports car speeding along a scenic coastal road with ocean views',
    'boat party with young people dancing on a yacht deck in the summer sun',
    'dynamic aerial view of a pulsing festival crowd on a beach at golden hour',
    'DJ jumping behind turntables with confetti raining over a summer festival crowd',
    'convertible full of friends driving through winding mountain roads at sunset',
    'jet ski spraying water in a turquoise bay with islands in the background',
    'close-up of DJ hands on the mixer with a cheering pool party crowd behind',
    'group of friends running into the ocean waves at a summer beach party',
    'speedboat cutting through crystal blue water between tropical islands',
  ],
  dark: [
    'lone DJ silhouette behind decks in a smoky club with dramatic backlight',
    'black muscle car driving on a wet coastal road under a stormy evening sky',
    'dramatic thunderstorm with lightning over a dark ocean seen from a cliff',
    'moody night drive through a mountain pass with headlights cutting the fog',
    'yacht sailing into a dramatic dark sunset with orange light breaking through clouds',
    'silhouette of a man standing on a rocky peak above a sea of night fog',
    'city skyline at night reflected in a dark harbor with a lone boat',
    'volcanic island coastline with waves crashing on black sand at dusk',
    'crowd silhouettes with raised hands under a single spotlight at a night concert',
    'midnight beach bonfire with silhouettes dancing under a full moon',
  ],
  happy: [
    'group of friends laughing and toasting at a beach bar in the summer sun',
    'festival crowd with confetti, colorful outfits and hands in the air',
    'family jumping off a boat into crystal clear turquoise island water',
    'friends on a road trip in a convertible waving hands under blue summer sky',
    'beach party with tiki torches, string lights and people dancing at sunset',
    'kids and adults playing beach volleyball on a white sand beach',
    'vibrant summer street market with people, colorful lanterns and ice cream',
    'friends hiking to a waterfall in a lush green mountain valley',
    'people cheering on a catamaran sailing past a tropical island',
    'fireworks over a summer marina with people celebrating on boat decks',
  ],
  euphoric: [
    'DJ with arms raised on a massive festival main stage with pyrotechnics at sunset',
    'crowd of thousands with hands up at a beach festival as the sun dips into the ocean',
    'hiker standing on a mountain peak above the clouds at sunrise with arms spread wide',
    'aerial view of a yacht anchored by a heart-shaped tropical island in turquoise sea',
    'woman standing through a car sunroof on a coastal road at golden hour, arms in the air',
    'paraglider soaring over a stunning island coastline in warm evening light',
    'friends celebrating on a boat bow like flying, sun flare over open sea',
    'aurora borealis dancing over snow-capped mountains with tiny hikers watching below',
    'massive ocean wave with a surfer riding through golden sunset light',
    'sunrise breaking over an infinity of green islands seen from a mountain summit',
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

  // Shuffle so each video gets a different mix of scenes instead of always the first few
  const shuffled = [...themes].sort(() => Math.random() - 0.5);
  const selectedThemes = Array.from({ length: count }, (_, i) => shuffled[i % shuffled.length]);

  const enhancedPrompts = selectedThemes.map((theme) =>
    `${theme}. ${options.genre ? `Feeling of ${options.genre} music.` : ''} ${options.visualStyle ? `Visual style: ${options.visualStyle}.` : ''} Photorealistic, cinematic, warm natural light, atmospheric, no text or watermarks, 16:9 aspect ratio.`
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
            style: 'photorealistic travel and lifestyle photography, golden hour light, high contrast',
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
              style: 'cinematic lifestyle photography, vibrant summer colors',
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
  "visualStyle": "description of a real-life visual style that fits the music (summer, beach, boats, cars, islands, mountains, people, DJ scenes — avoid neon/abstract)",
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
    visualStyle: 'Warm summer lifestyle scenes with people, beaches, boats and golden light',
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
  "imagePrompt": "A vivid image prompt for the video thumbnail (real-life summer scene: people, DJ, beach, boat, car, island or mountains — photorealistic, no text)",
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
    imagePrompt: `Photorealistic summer lifestyle scene for ${options.genre} music, ${options.mood} mood — people enjoying a beach, boat or festival at golden hour, no text`,
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
