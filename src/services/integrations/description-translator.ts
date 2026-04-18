/**
 * description-translator — generates a 3-language (Norwegian + English +
 * Spanish) intro + CTA block for YouTube descriptions. Helps Re-Master Freddy
 * reach NO/EN/ES audiences in one upload without diluting any single-language
 * SEO signal (each block is clearly delimited and labeled).
 *
 * Output is prepended to the main description, BEFORE chapter markers.
 */

import { askClaude } from '@/services/ai/claude-client';

export interface TranslatedBlocks {
  no: string;
  en: string;
  es: string;
}

export interface TranslateOptions {
  title: string;
  artist?: string;
  genre: string;
  mood: string;
}

/**
 * Generate the 3-language intro block. Each language gets 2-3 sentences of
 * vibe description + a clear "subscribe / like / comment" CTA appropriate for
 * that culture.
 */
export async function generateMultilingualIntro(options: TranslateOptions): Promise<TranslatedBlocks | null> {
  const prompt = `You are writing YouTube video descriptions for a music channel.
Generate a short intro + CTA in THREE languages for this track:

Track: "${options.title}"
Artist: ${options.artist || 'Re-Master Freddy'}
Genre: ${options.genre}
Mood: ${options.mood}

For EACH language (Norwegian, English, Spanish), produce 2-3 sentences that:
  - Describe the vibe of the track (use genre-appropriate vocabulary)
  - End with a culturally-natural CTA (subscribe + like + comment)
  - Include 1 emoji max per block
  - Stay under 280 characters per language

Respond with ONLY this JSON (no markdown, no commentary):
{
  "no": "Norwegian intro + CTA here",
  "en": "English intro + CTA here",
  "es": "Spanish intro + CTA here"
}`;

  try {
    const raw = await askClaude(prompt, { temperature: 0.6, maxTokens: 700 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.no === 'string' &&
      typeof parsed.en === 'string' &&
      typeof parsed.es === 'string'
    ) {
      return {
        no: parsed.no.trim(),
        en: parsed.en.trim(),
        es: parsed.es.trim(),
      };
    }
    return null;
  } catch (err) {
    console.warn('[DescriptionTranslator] Generation failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Render the translated blocks as a single string with clear language labels.
 * Placed at the top of the description so YouTube's language-detection picks
 * the user's preferred language in the truncated preview.
 */
export function renderMultilingualBlock(blocks: TranslatedBlocks): string {
  return [
    `🇳🇴 ${blocks.no}`,
    '',
    `🇬🇧 ${blocks.en}`,
    '',
    `🇪🇸 ${blocks.es}`,
  ].join('\n');
}

/**
 * Prepend the 3-language block to an existing description, preserving the
 * rest of the original content (which already has genre-appropriate SEO).
 */
export function injectMultilingualIntro(description: string, blocks: TranslatedBlocks): string {
  const block = renderMultilingualBlock(blocks);
  if (!description) return block;
  return `${block}\n\n${description}`;
}
