import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { setThumbnail, listVideos, extractVideoId } from '@/services/integrations/youtube-client';
import { REMASTER_SONG_READ_BRANDS } from '@/services/integrations/airtable-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NEURAL_BEAT_BRAND_ID = 'remasterfreddy';
const TEST_WINDOW_DAYS = 8;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

interface AbPeriod {
  variant: number;
  startAt: string;
  startViews: number;
  endAt?: string;
  endViews?: number;
  viewsPerHour?: number;
}

interface AbState {
  startedAt: string;
  periods: AbPeriod[];
  done?: boolean;
  winner?: number;
}

function closePeriod(period: AbPeriod, nowIso: string, currentViews: number) {
  period.endAt = nowIso;
  period.endViews = currentViews;
  const hours = Math.max(
    1,
    (new Date(nowIso).getTime() - new Date(period.startAt).getTime()) / 3_600_000,
  );
  period.viewsPerHour = (currentViews - period.startViews) / hours;
}

/**
 * GET /api/neural-beat/thumbnail-ab
 *
 * Daily automatic thumbnail A/B test. For every recently published song that
 * has stored thumbnail variants:
 *   Day 1: record baseline for variant 0 (already live from the pipeline)
 *   Day 2..N: close the running period, rotate to the next variant
 *   After the last variant: pick the variant with the highest views/hour and
 *   lock it in as the permanent thumbnail.
 *
 * CTR data is not available via the Data API, so views gained per hour while
 * a variant was live is used as the proxy.
 *
 * Security: requires CRON_SECRET in Authorization header (Vercel Cron).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const since = new Date(Date.now() - TEST_WINDOW_DAYS * 24 * 3_600_000).toISOString();

    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, youtube_url, youtube_video_id, ai_metadata')
      .in('brand', [...REMASTER_SONG_READ_BRANDS])
      .not('youtube_url', 'is', null)
      .gte('updated_at', since)
      .limit(30);

    if (error) throw new Error(error.message);

    // One videos.list call covers every candidate — viewCount per videoId.
    const recentVideos = await listVideos(50, NEURAL_BEAT_BRAND_ID).catch(() => []);
    const viewsById = new Map(recentVideos.map((v) => [v.id, v.viewCount]));

    const nowIso = new Date().toISOString();
    const results: Array<Record<string, unknown>> = [];

    for (const song of songs || []) {
      try {
        const meta = song.ai_metadata || {};
        const variantUrls: string[] = meta.thumbnailVariantUrls || [];
        if (variantUrls.length < 2) continue;
        if (meta.customThumbnail) continue; // user picked their own — leave it

        const videoId: string =
          song.youtube_video_id || extractVideoId(song.youtube_url || '') || '';
        if (!videoId) continue;

        const currentViews = viewsById.get(videoId);
        if (currentViews === undefined) continue; // not in recent uploads window

        const ab: AbState = meta.thumbnailAb || { startedAt: nowIso, periods: [] };
        if (ab.done) continue;

        if (ab.periods.length === 0) {
          // Baseline: variant 0 is already live from the pipeline upload.
          ab.periods.push({ variant: 0, startAt: nowIso, startViews: currentViews });
          results.push({ songId: song.id, videoId, action: 'baseline', views: currentViews });
        } else if (ab.periods.length < variantUrls.length) {
          // Close the running period and rotate to the next variant.
          closePeriod(ab.periods[ab.periods.length - 1], nowIso, currentViews);
          const nextVariant = ab.periods.length;
          const res = await fetch(variantUrls[nextVariant]);
          if (!res.ok) throw new Error(`variant ${nextVariant} fetch HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          await setThumbnail(videoId, buffer, NEURAL_BEAT_BRAND_ID);
          ab.periods.push({ variant: nextVariant, startAt: nowIso, startViews: currentViews });
          results.push({ songId: song.id, videoId, action: 'rotate', variant: nextVariant });
        } else {
          // All variants tested — close the last period and lock the winner.
          closePeriod(ab.periods[ab.periods.length - 1], nowIso, currentViews);
          const winner = [...ab.periods].sort(
            (a, b) => (b.viewsPerHour ?? 0) - (a.viewsPerHour ?? 0),
          )[0];
          const res = await fetch(variantUrls[winner.variant]);
          if (!res.ok) throw new Error(`winner ${winner.variant} fetch HTTP ${res.status}`);
          const buffer = Buffer.from(await res.arrayBuffer());
          await setThumbnail(videoId, buffer, NEURAL_BEAT_BRAND_ID);
          ab.done = true;
          ab.winner = winner.variant;
          results.push({
            songId: song.id,
            videoId,
            action: 'winner',
            variant: winner.variant,
            viewsPerHour: winner.viewsPerHour,
          });
        }

        await supabase
          .from('songs')
          .update({
            ai_metadata: {
              ...meta,
              thumbnailAb: ab,
              activeThumbnailIndex: ab.done
                ? ab.winner
                : ab.periods[ab.periods.length - 1].variant,
            },
          })
          .eq('id', song.id);
      } catch (err) {
        results.push({
          songId: song.id,
          action: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    console.log(`[ThumbnailAB] Processed ${results.length} songs`);
    return NextResponse.json({ success: true, processed: results.length, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Thumbnail A/B cron failed' },
      { status: 500 },
    );
  }
}
