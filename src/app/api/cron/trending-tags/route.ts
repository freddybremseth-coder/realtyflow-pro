export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { saveTrendingTags, type TrendingTagsRecord } from '@/services/integrations/trending-tags-store';
import { evaluateCronSafeMode } from '@/lib/cron/safe-mode';

// Vercel cron: "crons": [{ "path": "/api/cron/trending-tags", "schedule": "0 5 * * 1" }]
// Runs weekly on Mondays at 05:00 UTC
//
// Uses YouTube Data API v3 `videos.list?chart=mostPopular&videoCategoryId=10`
// (Music category) to harvest the top 50 trending music videos in a region,
// then ranks their tags by frequency. Top 40 get stored in brand_settings for
// the neural-beat pipeline to pull from when generating SEO metadata.
//
// Auth: requires YOUTUBE_API_KEY (a simple API key — not OAuth — works for
// public read endpoints like `videos.list`). Falls back silently if missing.

export const maxDuration = 60;

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
    // Weight by log(views) — so a 100M-view video's tags count more than a 1M one,
    // but a single viral outlier doesn't dominate.
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
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const safeMode = await evaluateCronSafeMode('/api/cron/trending-tags');
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
      return NextResponse.json(
        { error: 'YOUTUBE_API_KEY not configured' },
        { status: 501 },
      );
    }

    const region = process.env.YOUTUBE_TRENDING_REGION || 'US';
    const items = await fetchMostPopular(apiKey, region);

    if (!items.length) {
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

    return NextResponse.json({
      success: true,
      saved,
      region,
      videosScanned: items.length,
      tagCount: tags.length,
      top10: tags.slice(0, 10),
    });
  } catch (err) {
    console.error('[TrendingTagsCron] Failed:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Trending tags cron failed' },
      { status: 500 },
    );
  }
}
