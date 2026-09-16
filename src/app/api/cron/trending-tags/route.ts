export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { saveTrendingTags, type TrendingTagsRecord } from '@/services/integrations/trending-tags-store';
import { requireCronApi } from '@/lib/api-cron';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

// Runs weekly on Mondays. Uses YouTube most-popular Music videos to harvest
// frequently used tags for SEO metadata. Public API reads use YOUTUBE_API_KEY.
export const maxDuration = 60;
const PATH = '/api/cron/trending-tags';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function audit(status: 'success' | 'partial' | 'failed', details: Record<string, unknown>) {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('automation_logs').insert({
    action: 'trending_tags',
    agent_name: 'sam_seo_expert',
    status,
    details: { runtime_control: `cron:${PATH}`, ...details },
  });
  if (error) console.warn('[TrendingTagsCron] automation log failed', error.message);
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'by',
  'with', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'that',
  'this', 'these', 'those', 'his', 'her', 'its', 'our', 'their', 'my', 'your',
  'music', 'song', 'video', 'official', 'new', 'hd', '4k', 'mv',
]);

interface YouTubeVideoItem {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    channelTitle?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
}

async function fetchMostPopular(apiKey: string, region: string): Promise<YouTubeVideoItem[]> {
  const params = new URLSearchParams({
    part: 'snippet,statistics',
    chart: 'mostPopular',
    videoCategoryId: '10',
    maxResults: '50',
    regionCode: region,
    key: apiKey,
  });
  const url = `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return (json.items || []) as YouTubeVideoItem[];
}

function normalizeTag(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["'`]/g, '')
    .replace(/\s+/g, ' ');
  if (!cleaned) return null;
  if (cleaned.length < 3 || cleaned.length > 30) return null;
  if (STOP_WORDS.has(cleaned)) return null;
  if (/^\d+$/.test(cleaned)) return null;
  return cleaned;
}

function rankTags(videos: YouTubeVideoItem[]): string[] {
  const counts = new Map<string, number>();
  for (const v of videos) {
    const tags = v.snippet?.tags || [];
    const views = parseInt(v.statistics?.viewCount || '1', 10);
    const weight = Math.max(1, Math.log10(views));
    for (const raw of tags) {
      const norm = normalizeTag(raw);
      if (!norm) continue;
      counts.set(norm, (counts.get(norm) || 0) + weight);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([tag]) => tag);
}

export async function GET(request: NextRequest) {
  try {
    const unauthorized = requireCronApi(request);
    if (unauthorized) return unauthorized;

    const safeMode = await evaluateCronSafeMode(PATH);
    if (safeMode.skip) {
      return NextResponse.json({
        success: true,
        skipped: true,
        mode: safeMode.mode,
        reason: safeMode.reason,
      });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      await audit('failed', { reason: 'YOUTUBE_API_KEY not configured' });
      return NextResponse.json(
        { error: 'YOUTUBE_API_KEY not configured' },
        { status: 501 },
      );
    }

    const region = process.env.YOUTUBE_TRENDING_REGION || 'US';
    const items = await fetchMostPopular(apiKey, region);

    if (!items.length) {
      await audit('partial', { region, videos_scanned: 0, tags_saved: 0, reason: 'No trending videos returned' });
      return NextResponse.json(
        { warning: 'No trending videos returned', region },
        { status: 200 },
      );
    }

    const tags = rankTags(items);
    const record: TrendingTagsRecord = {
      tags,
      updatedAt: new Date().toISOString(),
      sample: {
        videosScanned: items.length,
        region,
        category: '10',
      },
    };

    const saved = await saveTrendingTags(record);
    await audit('success', {
      saved,
      region,
      videos_scanned: items.length,
      tags_saved: tags.length,
    });

    return NextResponse.json({
      success: true,
      saved,
      region,
      videosScanned: items.length,
      tagCount: tags.length,
      top10: tags.slice(0, 10),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Trending tags cron failed';
    console.error('[TrendingTagsCron] Failed:', message);
    await audit('failed', { error: message.slice(0, 500) });
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
