import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateMix, formatChapterTime } from '@/services/integrations/mix-generator';
import { composeThumbnail } from '@/services/integrations/thumbnail-composer';
import { uploadVideo, setThumbnail } from '@/services/integrations/youtube-client';
import {
  getGenreImages,
  getLatestLogoUrl,
  REMASTER_CANONICAL_SONG_BRAND,
  REMASTER_SONG_READ_BRANDS,
} from '@/services/integrations/airtable-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NEURAL_BEAT_BRAND_ID = 'remasterfreddy';
const MAX_MIX_MINUTES = 26; // keep render + upload inside the serverless budget
const MAX_TRACKS = 10;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

function titleCase(value: string) {
  return String(value || '')
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * GET /api/neural-beat/weekly-mix
 *
 * Weekly cron: builds and publishes a ~25 min genre mix from already
 * published songs. Long-form mixes are the search magnet in this niche —
 * and the tracklist links send viewers back to the original videos.
 *
 * Genre rotates deterministically by ISO week number, so no state needed.
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

    const { data: songs, error } = await supabase
      .from('songs')
      .select('id, title, artist, audio_url, youtube_url, genre, mood, ai_metadata')
      .in('brand', [...REMASTER_SONG_READ_BRANDS])
      .not('audio_url', 'is', null)
      .not('youtube_url', 'is', null)
      .limit(400);

    if (error) throw new Error(error.message);

    const pool = (songs || []).filter((s) => !s.ai_metadata?.isMix);
    if (pool.length < 4) {
      return NextResponse.json({ success: true, message: 'For få publiserte sanger til en mix ennå.' });
    }

    // Group by genre; rotate through the genres with enough tracks by week.
    const byGenre = new Map<string, typeof pool>();
    for (const song of pool) {
      const g = (song.genre || 'EDM').trim();
      if (!byGenre.has(g)) byGenre.set(g, []);
      byGenre.get(g)!.push(song);
    }
    const eligible = Array.from(byGenre.entries())
      .filter(([, list]) => list.length >= 4)
      .sort((a, b) => b[1].length - a[1].length);
    if (eligible.length === 0) {
      return NextResponse.json({ success: true, message: 'Ingen sjanger har nok sanger til en mix.' });
    }

    const week = Math.floor(Date.now() / (7 * 24 * 3_600_000));
    const [genre, genreSongs] = eligible[week % eligible.length];

    // Random selection, capped by track count and total duration budget.
    const shuffled = [...genreSongs].sort(() => Math.random() - 0.5).slice(0, MAX_TRACKS + 4);

    // ── Download audio until we hit the duration budget ──
    const tracks: Array<{ title: string; audioBuffer: Buffer; youtubeUrl: string }> = [];
    let totalSeconds = 0;
    for (const song of shuffled) {
      if (tracks.length >= MAX_TRACKS || totalSeconds > MAX_MIX_MINUTES * 60) break;
      try {
        const res = await fetch(song.audio_url);
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        // Rough duration estimate from MP3 size (~1 MB/min at 128-160 kbps)
        totalSeconds += Math.max(120, (buf.length / (1024 * 1024)) * 60);
        tracks.push({ title: song.title, audioBuffer: buf, youtubeUrl: song.youtube_url });
      } catch { /* skip */ }
    }
    if (tracks.length < 3) {
      return NextResponse.json({ success: false, error: 'Kunne ikke laste nok lydspor.' }, { status: 200 });
    }

    // ── Backgrounds + logo ──
    const genreImages = await getGenreImages(genre, tracks.length).catch(() => []);
    const imageBuffers: Buffer[] = [];
    for (const img of genreImages) {
      try {
        const res = await fetch(img.imageUrl);
        if (res.ok) imageBuffers.push(Buffer.from(await res.arrayBuffer()));
      } catch { /* skip */ }
    }
    if (imageBuffers.length === 0) {
      return NextResponse.json({ success: false, error: 'Ingen bakgrunnsbilder tilgjengelig.' }, { status: 200 });
    }

    let logoBuffer: Buffer | undefined;
    const logoUrl = (await getLatestLogoUrl())
      || process.env.REMASTER_LOGO_URL
      || 'https://remaster.freddybremseth.com/assets/remaster-logo.png';
    try {
      const res = await fetch(logoUrl);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch { /* non-fatal */ }

    // ── Render ──
    const mix = await generateMix({
      tracks: tracks.map(({ title, audioBuffer }) => ({ title, audioBuffer })),
      imageBuffers,
      logoBuffer,
    });

    // ── Metadata ──
    const year = new Date().getFullYear();
    const genreTitle = titleCase(genre);
    const minutes = Math.round(mix.durationSeconds / 60);
    const mixTitle = `${genreTitle} Mix ${year} | ${minutes} Min Nonstop | Re-Master Freddy`;

    const tracklist = mix.chapters
      .map((c, i) => `${formatChapterTime(c.start)} ${c.title}${tracks[i]?.youtubeUrl ? ` — ${tracks[i].youtubeUrl}` : ''}`)
      .join('\n');

    const description = [
      `${minutes} minutes of nonstop ${genreTitle.toLowerCase()} by Re-Master Freddy. 🎧`,
      '',
      '⏱️ Tracklist',
      `0:00 Intro`,
      tracklist,
      '',
      '🔔 Subscribe for new tracks every day and a fresh mix every week!',
      '',
      `#${genreTitle.replace(/\s/g, '')}Mix #EDM #ReMasterFreddy #ElectronicMusic #DJMix #${year}`,
    ].join('\n');

    const uploadResult = await uploadVideo(mix.videoBuffer, {
      title: mixTitle,
      description,
      tags: [
        `${genre} mix`, `${genre} mix ${year}`, 'EDM mix', 'electronic music mix',
        'dj mix', 'nonstop mix', 'Re-Master Freddy', genre, 'party mix', 'summer mix',
      ],
      categoryId: '10',
      privacyStatus: 'public',
      defaultAudioLanguage: 'zxx',
    }, NEURAL_BEAT_BRAND_ID, { requireBrandToken: true });

    // ── Branded thumbnail ──
    try {
      const thumb = await composeThumbnail({
        backgroundBuffer: imageBuffers[0],
        hook: `${genreTitle.toUpperCase()} MIX`,
        subtext: `${minutes} Min Nonstop ${year}`,
        logoBuffer,
      });
      await setThumbnail(uploadResult.videoId, thumb, NEURAL_BEAT_BRAND_ID);
    } catch (err) {
      console.warn('[WeeklyMix] Thumbnail failed (non-fatal):', err instanceof Error ? err.message : err);
    }

    // ── Record the mix so admin history shows it and cleanup skips it ──
    try {
      await supabase.from('songs').insert({
        title: mixTitle,
        artist: 'Re-Master Freddy',
        brand: REMASTER_CANONICAL_SONG_BRAND,
        youtube_url: uploadResult.youtubeUrl,
        status: 'published',
        genre,
        ai_metadata: { isMix: true, trackCount: tracks.length, processedAt: new Date().toISOString() },
      });
    } catch (err) {
      console.warn('[WeeklyMix] DB record failed (non-fatal):', err instanceof Error ? err.message : err);
    }

    console.log(`[WeeklyMix] Published: ${uploadResult.youtubeUrl} (${genre}, ${tracks.length} tracks, ${minutes} min)`);
    return NextResponse.json({
      success: true,
      youtubeUrl: uploadResult.youtubeUrl,
      genre,
      tracks: tracks.length,
      minutes,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Weekly mix failed' },
      { status: 500 },
    );
  }
}
