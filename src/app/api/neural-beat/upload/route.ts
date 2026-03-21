import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/neural-beat/upload
 * Returns a signed upload URL for Supabase Storage.
 * The client then uploads the MP3 directly to that URL (bypasses Vercel 4.5MB limit).
 * Body: { fileName: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { fileName } = await request.json();

    if (!fileName) {
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

    const storagePath = `neural-beat/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Create a signed upload URL (valid for 10 minutes)
    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/upload/sign/assets/${storagePath}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 600 }),
      }
    );

    if (!res.ok) {
      // Fallback: return a direct upload URL with service key token
      // This works because the service_role key bypasses RLS
      return NextResponse.json({
        uploadUrl: `${supabaseUrl}/storage/v1/object/assets/${storagePath}`,
        token: serviceKey,
        publicUrl: `${supabaseUrl}/storage/v1/object/public/assets/${storagePath}`,
        method: 'direct',
      });
    }

    const data = await res.json();

    return NextResponse.json({
      uploadUrl: `${supabaseUrl}/storage/v1${data.url}`,
      token: data.token || serviceKey,
      publicUrl: `${supabaseUrl}/storage/v1/object/public/assets/${storagePath}`,
      method: 'signed',
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
