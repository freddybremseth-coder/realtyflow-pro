import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';
import { generateYouTubeSEO } from '@/services/integrations/gemini-client';
import { composeThumbnail } from '@/services/integrations/thumbnail-composer';
import { updateVideoMetadata, setThumbnail, extractVideoId } from '@/services/integrations/youtube-client';
import {
  getGenreImages,
  getLatestLogoUrl,
  REMASTER_SONG_READ_BRANDS,
} from '@/services/integrations/airtable-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NEURAL_BEAT_BRAND_ID = 'remasterfreddy';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

async function uploadThumbnailToStorage(buffer: Buffer, filename: string): Promise<string> {
  const supabase = getSupabase();
  const storagePath = `cleanup-thumbs/${Date.now()}-${filename}`;
  const { error } = await supabase.storage
    .from('neural-beat')
    .upload(storagePath, buffer, { contentType: 'image/png', upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return supabase.storage.from('neural-beat').getPublicUrl(storagePath).data.publicUrl;
}

interface CleanupProposal {
  status: 'pending' | 'applied' | 'failed';
  title: string;
  tags: string[];
  hook: string;
  thumbnailUrl?: string;
  proposedAt: string;
  appliedAt?: string;
  error?: string;
}

/**
 * GET /api/neural-beat/library-cleanup?limit=10
 *
 * Generates cleanup proposals (new CTR-optimized title + tags + branded
 * thumbnail preview) for the next batch of published videos that have no
 * proposal yet. Nothing is changed on YouTube — proposals are stored on the
 * song and returned for review in the admin UI.
 */
export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request, { proposals: [] });
  if (adminError) return adminError;

  try {
    const limit = Math.max(1, Math.min(15, parseInt(request.nextUrl.searchParams.get('limit') || '10', 10) || 10));
    const supabase = getSupabase();

    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, name, artist, youtube_url, youtube_video_id, genre, mood, style, ai_metadata')
      .in('brand', [...REMASTER_SONG_READ_BRANDS])
      .not('youtube_url', 'is', null)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) throw new Error(error.message);

    const candidates = (songs || [])
      .filter((s) => !s.ai_metadata?.cleanup && !s.ai_metadata?.isMix)
      .slice(0, limit);

    if (candidates.length === 0) {
      return NextResponse.json({ proposals: [], remaining: 0, message: 'Alle videoer har allerede forslag eller er ryddet.' });
    }

    // Shared assets: logo + a pool of genre images for thumbnail backgrounds.
    let logoBuffer: Buffer | undefined;
    const logoUrl = (await getLatestLogoUrl())
      || process.env.REMASTER_LOGO_URL
      || 'https://remaster.freddybremseth.com/assets/remaster-logo.png';
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch { /* non-fatal */ }

    const proposals: Array<Record<string, unknown>> = [];

    for (const song of candidates) {
      try {
        const genre = song.genre || 'EDM';
        const mood = song.mood || 'energetic';
        const seo = await generateYouTubeSEO({
          title: song.name,
          artist: song.artist || 'Re-Master Freddy',
          genre,
          style: song.style || 'progressive',
          mood,
        });

        const hook = seo.thumbnailVariants?.[0]?.hook || mood.toUpperCase();

        // Branded thumbnail preview on a fresh genre image background.
        let thumbnailUrl: string | undefined;
        try {
          const bgImages = await getGenreImages(genre, 3);
          const bg = bgImages[Math.floor(Math.random() * bgImages.length)];
          if (bg) {
            const bgRes = await fetch(bg.imageUrl);
            if (bgRes.ok) {
              const buf = await composeThumbnail({
                backgroundBuffer: Buffer.from(await bgRes.arrayBuffer()),
                hook,
                titleText: song.name,
                logoBuffer,
              });
              thumbnailUrl = await uploadThumbnailToStorage(buf, `${song.id}.png`);
            }
          }
        } catch (err) {
          console.warn(`[LibraryCleanup] Thumbnail preview failed for ${song.id}:`, err instanceof Error ? err.message : err);
        }

        const proposal: CleanupProposal = {
          status: 'pending',
          title: seo.title,
          tags: seo.tags,
          hook,
          thumbnailUrl,
          proposedAt: new Date().toISOString(),
        };

        await supabase
          .from('songs')
          .update({ ai_metadata: { ...(song.ai_metadata || {}), cleanup: proposal } })
          .eq('id', song.id);

        proposals.push({
          songId: song.id,
          oldTitle: song.name,
          newTitle: seo.title,
          hook,
          thumbnailUrl,
          youtubeUrl: song.youtube_url,
        });
      } catch (err) {
        console.warn(`[LibraryCleanup] Proposal failed for ${song.id}:`, err instanceof Error ? err.message : err);
      }
    }

    const remaining = (songs || []).filter((s) => !s.ai_metadata?.cleanup && !s.ai_metadata?.isMix).length - candidates.length;
    return NextResponse.json({ proposals, remaining: Math.max(0, remaining) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Library cleanup preview failed' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/neural-beat/library-cleanup
 * Body: { songIds: string[] }
 *
 * Applies approved proposals: updates the YouTube title + tags and sets the
 * branded thumbnail. Description is left untouched (it may contain chapters
 * and links we don't want to destroy). Quota note: ~100 units per video —
 * keep batches ≤ 50/day alongside the daily upload pipeline.
 */
export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request, { results: [] });
  if (adminError) return adminError;

  try {
    const { songIds } = await request.json();
    if (!Array.isArray(songIds) || songIds.length === 0) {
      return NextResponse.json({ error: 'songIds (array) er påkrevd' }, { status: 400 });
    }

    const supabase = getSupabase();
    const results: Array<Record<string, unknown>> = [];

    for (const songId of songIds.slice(0, 25)) {
      const { data: song } = await supabase
        .from('songs')
        .select('id, name, youtube_url, youtube_video_id, ai_metadata')
        .eq('id', songId)
        .single();

      const cleanup: CleanupProposal | undefined = song?.ai_metadata?.cleanup;
      if (!song || !cleanup || cleanup.status !== 'pending') {
        results.push({ songId, status: 'skipped', reason: 'Ingen ventende forslag' });
        continue;
      }

      const videoId = song.youtube_video_id || extractVideoId(song.youtube_url || '') || '';
      if (!videoId) {
        results.push({ songId, status: 'skipped', reason: 'Mangler video-ID' });
        continue;
      }

      try {
        await updateVideoMetadata(videoId, { title: cleanup.title, tags: cleanup.tags }, NEURAL_BEAT_BRAND_ID);

        if (cleanup.thumbnailUrl) {
          try {
            const res = await fetch(cleanup.thumbnailUrl);
            if (res.ok) {
              await setThumbnail(videoId, Buffer.from(await res.arrayBuffer()), NEURAL_BEAT_BRAND_ID);
            }
          } catch (err) {
            console.warn(`[LibraryCleanup] setThumbnail failed for ${videoId}:`, err instanceof Error ? err.message : err);
          }
        }

        cleanup.status = 'applied';
        cleanup.appliedAt = new Date().toISOString();
        await supabase
          .from('songs')
          .update({ ai_metadata: { ...song.ai_metadata, cleanup } })
          .eq('id', songId);

        results.push({ songId, status: 'applied', videoId, newTitle: cleanup.title });
        console.log(`[LibraryCleanup] Applied cleanup to ${videoId}: "${cleanup.title}"`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        cleanup.status = 'failed';
        cleanup.error = message.slice(0, 300);
        await supabase
          .from('songs')
          .update({ ai_metadata: { ...song.ai_metadata, cleanup } })
          .eq('id', songId);
        results.push({ songId, status: 'failed', error: message.slice(0, 200) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Library cleanup apply failed' },
      { status: 500 },
    );
  }
}
