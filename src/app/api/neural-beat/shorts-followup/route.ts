import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  detectTopSections,
  generateShortFromAudio,
  buildShortsTitle,
} from '@/services/integrations/shorts-generator';
import { uploadVideo } from '@/services/integrations/youtube-client';
import {
  getGenreImages,
  getLatestLogoUrl,
  REMASTER_SONG_READ_BRANDS,
} from '@/services/integrations/airtable-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NEURAL_BEAT_BRAND_ID = 'remasterfreddy';
const MAX_FOLLOWUP_SHORTS = 2; // in addition to the pipeline Short
const MIN_HOURS_BETWEEN_SHORTS = 40; // ~2 days apart spreads discovery
const CANDIDATE_WINDOW_DAYS = 12;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

interface FollowupUpload {
  url: string;
  videoId: string;
  startSeconds: number;
  at: string;
}

/**
 * GET /api/neural-beat/shorts-followup
 *
 * Daily cron: publishes ONE extra Short for the most recent song that still
 * has follow-up Shorts left (max 2 extra, ≥40h apart). Each follow-up uses a
 * DIFFERENT section of the song (second chorus, build-up...), fresh
 * background images and a different hook — per the 3-5 Shorts/release
 * strategy that multiplies discovery surface area.
 *
 * The original rendered video is not stored, so the Short is rendered
 * directly from the song MP3 + genre images with full branding.
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
    const since = new Date(Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 3_600_000).toISOString();

    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, title, artist, audio_url, youtube_url, genre, mood, ai_metadata, updated_at')
      .in('brand', [...REMASTER_SONG_READ_BRANDS])
      .not('youtube_url', 'is', null)
      .not('audio_url', 'is', null)
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error) throw new Error(error.message);

    const now = Date.now();
    const candidate = (songs || []).find((song) => {
      const meta = song.ai_metadata || {};
      if (!meta.shortsUrl) return false; // pipeline Short must exist first
      const uploads: FollowupUpload[] = meta.shortsFollowup?.uploads || [];
      if (uploads.length >= MAX_FOLLOWUP_SHORTS) return false;
      const lastShortAt = uploads.length > 0
        ? new Date(uploads[uploads.length - 1].at).getTime()
        : new Date(meta.processedAt || song.updated_at).getTime();
      return now - lastShortAt >= MIN_HOURS_BETWEEN_SHORTS * 3_600_000;
    });

    if (!candidate) {
      return NextResponse.json({ success: true, message: 'No songs due for a follow-up Short' });
    }

    const meta = candidate.ai_metadata || {};
    const uploads: FollowupUpload[] = meta.shortsFollowup?.uploads || [];

    // ── Pick a section we haven't used yet ──
    const audioRes = await fetch(candidate.audio_url);
    if (!audioRes.ok) throw new Error(`Audio fetch HTTP ${audioRes.status}`);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());

    const usedStarts = [
      ...(typeof meta.shortsDropStartSeconds === 'number' ? [meta.shortsDropStartSeconds] : []),
      ...uploads.map((u) => u.startSeconds),
    ];
    const sections = await detectTopSections(audioBuffer, usedStarts);
    const sectionStart = sections.length > 0
      ? Math.max(0, sections[0] - 3)
      : Math.max(0, usedStarts.length * 45); // spread heuristically if detection fails

    // ── Fresh background images (different from the original video mix) ──
    const genreImages = await getGenreImages(candidate.genre || 'dance', 4).catch(() => []);
    const imageBuffers: Buffer[] = [];
    for (const img of genreImages.slice(0, 4)) {
      try {
        const res = await fetch(img.imageUrl);
        if (res.ok) imageBuffers.push(Buffer.from(await res.arrayBuffer()));
      } catch { /* skip */ }
    }
    // Fallback: reuse stored thumbnail variants as backgrounds
    if (imageBuffers.length === 0) {
      for (const url of (meta.thumbnailVariantUrls || []).slice(0, 3)) {
        try {
          const res = await fetch(url);
          if (res.ok) imageBuffers.push(Buffer.from(await res.arrayBuffer()));
        } catch { /* skip */ }
      }
    }
    if (imageBuffers.length === 0) {
      return NextResponse.json(
        { success: false, songId: candidate.id, error: 'No background images available' },
        { status: 200 },
      );
    }

    // ── Logo (same auto chain as the pipeline) ──
    let logoBuffer: Buffer | undefined;
    const logoUrl = (await getLatestLogoUrl())
      || process.env.REMASTER_LOGO_URL
      || 'https://remaster.freddybremseth.com/assets/remaster-logo.png';
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch { /* non-fatal */ }

    // Use a different hook than the previous Shorts for variety.
    const hooks: string[] = meta.thumbnailHooks || [];
    const hook = hooks[(uploads.length + 1) % Math.max(1, hooks.length)]
      || candidate.mood?.toUpperCase()
      || 'NEW DROP';

    const short = await generateShortFromAudio({
      audioBuffer,
      imageBuffers,
      startTime: sectionStart,
      targetDuration: 35,
      hook,
      endCard: 'FULL VERSION IN DESC 👇',
      accentColor: uploads.length === 0 ? '66e5ff' : 'ffe066',
      titleText: candidate.title,
      logoBuffer,
    });

    const shortsTitle = buildShortsTitle({
      title: candidate.title,
      genre: candidate.genre || 'EDM',
      mood: candidate.mood || 'energetic',
      hook,
    });

    const description = [
      `🎧 Hele sangen / Full version: ${candidate.youtube_url}`,
      '',
      `${candidate.title} — Re-Master Freddy`,
      '',
      '#Shorts #AIMusic #ReMasterFreddy #ChillBeats #StudyMusic #EDM',
    ].join('\n');

    const uploadResult = await uploadVideo(short.videoBuffer, {
      title: shortsTitle,
      description,
      tags: ['Shorts', 'YouTube Shorts', candidate.genre || 'EDM', candidate.mood || 'music', 'Re-Master Freddy', 'AI Music'],
      categoryId: '10',
      privacyStatus: 'public',
      defaultAudioLanguage: 'zxx',
    }, NEURAL_BEAT_BRAND_ID, { requireBrandToken: true });

    const newUploads: FollowupUpload[] = [
      ...uploads,
      {
        url: uploadResult.youtubeUrl,
        videoId: uploadResult.videoId,
        startSeconds: sectionStart,
        at: new Date().toISOString(),
      },
    ];
    await supabase
      .from('songs')
      .update({ ai_metadata: { ...meta, shortsFollowup: { uploads: newUploads } } })
      .eq('id', candidate.id);

    console.log(`[ShortsFollowup] Uploaded follow-up Short ${newUploads.length}/${MAX_FOLLOWUP_SHORTS} for "${candidate.title}": ${uploadResult.youtubeUrl}`);
    return NextResponse.json({
      success: true,
      songId: candidate.id,
      title: candidate.title,
      shortUrl: uploadResult.youtubeUrl,
      sectionStart,
      followupNumber: newUploads.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Shorts follow-up cron failed' },
      { status: 500 },
    );
  }
}
