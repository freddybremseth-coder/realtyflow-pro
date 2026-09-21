import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-admin';
import { publishMissingArtShort } from '@/services/pipelines/remaster-art-short-publish';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Owner-only on-demand recovery for an already published art-video song. */
export async function POST(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;
  try {
    const body = await request.json().catch(() => ({}));
    const songId = typeof body.songId === 'string' ? body.songId : '';
    if (!/^[0-9a-f-]{36}$/i.test(songId)) {
      return NextResponse.json({ error: 'Valid songId is required' }, { status: 400 });
    }
    const result = await publishMissingArtShort(songId);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : 'Art Short generation failed',
    }, { status: 500 });
  }
}
