/**
 * Trending-tags store — persists the current top-N trending YouTube tags
 * (scoped to the music category) under `brand_settings` row `_system` so the
 * neural-beat pipeline can merge them into generated tag lists.
 *
 * Schema:
 *   brand_settings._system.settings.trending_youtube_tags = {
 *     tags: string[];            // ranked descending
 *     updatedAt: string;         // ISO timestamp
 *     sample: {
 *       videosScanned: number;
 *       region: string;
 *       category: string;        // e.g. "10" (Music)
 *     };
 *   }
 */

import { createClient } from '@supabase/supabase-js';

export interface TrendingTagsRecord {
  tags: string[];
  updatedAt: string;
  sample: {
    videosScanned: number;
    region: string;
    category: string;
  };
}

const SYSTEM_BRAND_ID = '_system';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Read the current trending tags. Returns null if none have been stored yet.
 * Swallows errors — callers should treat "no tags" as non-fatal.
 */
export async function loadTrendingTags(): Promise<TrendingTagsRecord | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('brand_settings')
      .select('settings')
      .eq('brand_id', SYSTEM_BRAND_ID)
      .single();
    if (error || !data) return null;
    const record = data.settings?.trending_youtube_tags as TrendingTagsRecord | undefined;
    if (!record || !Array.isArray(record.tags)) return null;
    return record;
  } catch {
    return null;
  }
}

/**
 * Persist a new trending-tags snapshot. Merges onto the existing `_system`
 * settings blob so other fields (like `youtube_refresh_token`) aren't
 * clobbered.
 */
export async function saveTrendingTags(record: TrendingTagsRecord): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  try {
    // Read existing settings to merge
    const { data: existing } = await supabase
      .from('brand_settings')
      .select('settings')
      .eq('brand_id', SYSTEM_BRAND_ID)
      .single();

    const merged = {
      ...(existing?.settings || {}),
      trending_youtube_tags: record,
    };

    if (existing) {
      const { error } = await supabase
        .from('brand_settings')
        .update({ settings: merged })
        .eq('brand_id', SYSTEM_BRAND_ID);
      if (error) {
        console.warn('[TrendingTagsStore] Update failed:', error.message);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('brand_settings')
        .insert({ brand_id: SYSTEM_BRAND_ID, settings: merged });
      if (error) {
        console.warn('[TrendingTagsStore] Insert failed:', error.message);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.warn('[TrendingTagsStore] Save error:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Return up to `limit` trending tags, filtered against a set of existing tags
 * so the pipeline can merge without duplicates.
 */
export async function getTopTrendingTags(limit = 3, exclude: string[] = []): Promise<string[]> {
  const record = await loadTrendingTags();
  if (!record) return [];
  const excludeLower = new Set(exclude.map((t) => t.toLowerCase().trim()));
  const out: string[] = [];
  for (const tag of record.tags) {
    const norm = tag.toLowerCase().trim();
    if (!norm || excludeLower.has(norm)) continue;
    out.push(tag);
    excludeLower.add(norm);
    if (out.length >= limit) break;
  }
  return out;
}
