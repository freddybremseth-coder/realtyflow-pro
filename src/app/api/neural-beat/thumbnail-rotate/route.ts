import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { setThumbnail, extractVideoId } from '@/services/integrations/youtube-client';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

/**
 * POST /api/neural-beat/thumbnail-rotate
 * Body: { songId: string, variantIndex: number }
 *
 * Swaps the active YouTube thumbnail to a previously-stored variant URL.
 * Useful for A/B testing: upload variant 0 initially, then promote a
 * better-performing variant after 24-48h based on analytics.
 */
export async function POST(request: NextRequest) {
  try {
    const { songId, variantIndex } = await request.json();
    if (!songId || typeof variantIndex !== 'number') {
      return NextResponse.json(
        { error: 'songId (string) and variantIndex (number) are required' },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const { data: song, error } = await supabase
      .from('songs')
      .select('id, youtube_url, youtube_video_id, ai_metadata')
      .eq('id', songId)
      .single();

    if (error || !song) {
      return NextResponse.json({ error: `Song not found: ${error?.message || 'unknown'}` }, { status: 404 });
    }

    const videoId: string = song.youtube_video_id || extractVideoId(song.youtube_url || '') || '';
    if (!videoId) {
      return NextResponse.json({ error: 'Song has no associated YouTube video' }, { status: 400 });
    }

    const variantUrls: string[] = song.ai_metadata?.thumbnailVariantUrls || [];
    if (variantIndex < 0 || variantIndex >= variantUrls.length) {
      return NextResponse.json(
        { error: `variantIndex out of range (0-${variantUrls.length - 1})` },
        { status: 400 },
      );
    }

    const thumbUrl = variantUrls[variantIndex];
    const res = await fetch(thumbUrl);
    if (!res.ok) {
      return NextResponse.json({ error: `Could not fetch variant: HTTP ${res.status}` }, { status: 502 });
    }
    const buffer = Buffer.from(await res.arrayBuffer());

    await setThumbnail(videoId, buffer);

    const updatedMetadata = {
      ...(song.ai_metadata || {}),
      activeThumbnailIndex: variantIndex,
      lastThumbnailRotationAt: new Date().toISOString(),
    };
    await supabase
      .from('songs')
      .update({ ai_metadata: updatedMetadata })
      .eq('id', songId);

    return NextResponse.json({
      success: true,
      videoId,
      variantIndex,
      variantUrl: thumbUrl,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Thumbnail rotation failed' },
      { status: 500 },
    );
  }
}
