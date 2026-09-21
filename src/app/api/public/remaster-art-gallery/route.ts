import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SONG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ART_ID = /^[a-z0-9][a-z0-9-]{0,120}$/;
const VALID_BRANDS = new Set(['remasterfreddy', 'neural-beat', 'neuralbeat']);

export async function GET(request: NextRequest) {
  const songId = request.nextUrl.searchParams.get('songId') || '';
  if (!SONG_ID.test(songId)) return NextResponse.json({ error: 'Invalid song ID' }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Gallery unavailable' }, { status: 503 });
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.from('songs')
      .select('id,name,artist,brand,status,youtube_url,ai_metadata').eq('id', songId).maybeSingle();
    if (error) throw error;
    const artworks = data?.ai_metadata?.artGallery;
    if (!data || !VALID_BRANDS.has(String(data.brand)) ||
        data.status !== 'published' || !data.youtube_url || !Array.isArray(artworks) || !artworks.length) {
      return NextResponse.json({ error: 'Gallery not published' }, { status: 404 });
    }
    const allowedPrefix = `${url.replace(/\/$/, '')}/storage/v1/object/public/art-previews/`;
    const safeArtworks = artworks.filter((item: any) =>
      item && ART_ID.test(String(item.id)) &&
      typeof item.imageUrl === 'string' && item.imageUrl.startsWith(allowedPrefix) &&
      typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.startsWith(allowedPrefix) &&
      item.artworkUrl === `https://art.freddybremseth.com/verk/${item.id}/`
    ).slice(0, 16).map((item: any) => ({
      id: item.id,
      title: String(item.title || 'Freddy Bremseth Art').slice(0, 160),
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      artworkUrl: item.artworkUrl,
    }));
    if (!safeArtworks.length) return NextResponse.json({ error: 'Gallery not published' }, { status: 404 });
    const response = NextResponse.json({
      songId: data.id, title: String(data.name || 'Re-Master Freddy').slice(0, 180),
      artist: 'Re-Master Freddy', youtubeUrl: data.youtube_url,
      artVisualMode: data.ai_metadata.artVisualMode || 'relaxing', artworks: safeArtworks,
    });
    response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=300');
    return response;
  } catch {
    return NextResponse.json({ error: 'Gallery unavailable' }, { status: 503 });
  }
}
