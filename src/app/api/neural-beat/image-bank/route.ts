import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * User image bank — persistent storage for images the user wants to reuse
 * across Neural Beat pipeline runs. Supports three kinds:
 *   - image:     slideshow custom images
 *   - logo:      watermark/thumbnail brand logos
 *   - thumbnail: custom thumbnails to override the AI-composed ones
 *   - product:   reusable product/reference images for ads and campaigns
 *   - variant:   AI-generated variants based on a product/reference image
 *
 * Table: user_image_bank (see migration 20260418_user_image_bank.sql).
 */

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const VALID_KINDS = new Set(['image', 'logo', 'thumbnail', 'product', 'variant']);

/**
 * GET /api/neural-beat/image-bank?kind=image&owner=system
 * Returns the user's saved images (newest first).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get('kind') || undefined;
    const owner = searchParams.get('owner') || 'system';
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10) || 24, 60);

    let query = supabase
      .from('user_image_bank')
      .select('id, url, thumbnail_url, name, kind, tags, width, height, size_bytes, created_at, last_used_at, use_count')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (owner !== 'all') {
      query = query.eq('owner', owner);
    }

    if (kind && VALID_KINDS.has(kind)) {
      query = query.eq('kind', kind);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ images: data || [], count: data?.length || 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load image bank' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/neural-beat/image-bank
 * Body: { url, name?, kind?, tags?, width?, height?, sizeBytes?, owner? }
 * Saves a newly-uploaded image (URL should already point to Supabase storage)
 * into the image bank for reuse.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const body = await request.json();
    const { url, thumbnailUrl, name, kind = 'image', tags = [], width, height, sizeBytes, owner = 'system' } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }
    if (!VALID_KINDS.has(kind)) {
      return NextResponse.json(
        { error: `kind must be one of: ${Array.from(VALID_KINDS).join(', ')}` },
        { status: 400 },
      );
    }

    const insertRow = {
      owner,
      url,
      thumbnail_url: thumbnailUrl || null,
      name: name || null,
      kind,
      tags: Array.isArray(tags) ? tags.slice(0, 20) : [],
      width: typeof width === 'number' ? width : null,
      height: typeof height === 'number' ? height : null,
      size_bytes: typeof sizeBytes === 'number' ? sizeBytes : null,
    };

    const { data, error } = await supabase
      .from('user_image_bank')
      .insert(insertRow)
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, image: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save image' },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/neural-beat/image-bank?id=<uuid>
 * Removes an entry from the bank. Does NOT delete from Supabase Storage —
 * the URL remains dereferenceable for any existing songs using it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
    }

    const { error } = await supabase.from('user_image_bank').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete image' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/neural-beat/image-bank
 * Body: { ids: string[] }
 * Bumps use_count and last_used_at for all supplied image IDs. Called by the
 * pipeline after a successful render so the UI can sort by "most used".
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const { ids } = await request.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids (non-empty array) is required' }, { status: 400 });
    }

    // Postgres doesn't expose increment via supabase-js; fall back to a
    // select-then-update pattern. Non-fatal if it fails.
    const { data: existing } = await supabase
      .from('user_image_bank')
      .select('id, use_count')
      .in('id', ids);

    if (existing) {
      await Promise.all(
        existing.map((row) =>
          supabase
            .from('user_image_bank')
            .update({
              use_count: (row.use_count || 0) + 1,
              last_used_at: new Date().toISOString(),
            })
            .eq('id', row.id),
        ),
      );
    }

    return NextResponse.json({ success: true, updated: existing?.length || 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update usage' },
      { status: 500 },
    );
  }
}
