import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

/**
 * POST /api/neural-beat/upload
 * Returns a short-lived signed upload URL for Supabase Storage.
 * The service role key is never returned to the browser.
 * Body: { fileName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const unauthorized = await requireAdminApi(request);
    if (unauthorized) return unauthorized;

    const { fileName } = await request.json();

    if (!fileName || typeof fileName !== 'string') {
      return NextResponse.json({ error: 'fileName is required' }, { status: 400 });
    }

    const fileExtension = fileName.split('.').pop()?.toLowerCase() || '';
    const allowedExtensions = new Set(['mp3', 'jpg', 'jpeg', 'png', 'webp']);
    if (!allowedExtensions.has(fileExtension)) {
      return NextResponse.json(
        { error: 'Only MP3 and image uploads are supported' },
        { status: 415 }
      );
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
    const bucket = 'assets';

    // Use the supported Supabase Storage SDK flow instead of constructing a
    // raw signed-upload REST URL by hand. Safari/iOS could surface the old
    // cross-origin PUT failure only as "Load failed".
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: signedData, error: signedError } = await serviceClient.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath);

    if (signedError || !signedData?.token) {
      console.error('[NeuralBeatUpload] Could not create signed upload URL', {
        message: signedError?.message || 'Unknown Supabase Storage error',
      });
      return NextResponse.json(
        { error: 'Could not create a secure upload URL. Try again.' },
        { status: 502 }
      );
    }

    const publicUrl = serviceClient.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;

    return NextResponse.json({
      bucket,
      storagePath,
      token: signedData.token,
      uploadUrl: signedData.signedUrl || null,
      publicUrl,
      method: 'supabase-signed-upload',
      expiresIn: 7200,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
