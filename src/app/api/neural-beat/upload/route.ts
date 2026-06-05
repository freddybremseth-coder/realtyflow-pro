import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural-beat/upload
 * Returns a short-lived signed upload URL for Supabase Storage.
 * The service role key is never returned to the browser.
 * Body: { fileName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { fileName } = await request.json();

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Supabase is not configured' },
        { status: 503 }
      );
    }

    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-180);
    const storagePath = `neural-beat/${Date.now()}-${safeFileName}`;

    const signedUrlResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/assets/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 600 }),
        cache: 'no-store',
      }
    );

    const signedData = await signedUrlResponse.json().catch(() => ({}));

    if (!signedUrlResponse.ok || !signedData.url || !signedData.token) {
      console.error('[NeuralBeatUpload] Could not create signed upload URL', {
        status: signedUrlResponse.status,
        message: signedData.message || signedData.error || 'Unknown Supabase Storage error',
      });
      return NextResponse.json(
        { error: 'Could not create a secure upload URL. Try again.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      uploadUrl: `${supabaseUrl}/storage/v1${signedData.url}`,
      token: signedData.token,
      publicUrl: `${supabaseUrl}/storage/v1/object/public/assets/${storagePath}`,
      method: 'signed',
      expiresIn: 600,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
