import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// GET: List actions with filters
export async function GET(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request, { success: false, actions: [] });
    if (adminError) return adminError;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const brand = searchParams.get('brand');
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    let query = supabase
      .from('growth_actions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (brand) {
      query = query.eq('brand', brand);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (type) {
      query = query.eq('action_type', type);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      actions: data || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[GrowthActions API] GET error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// PATCH: Update action (mark as published, add metrics, select A/B winner)
export async function PATCH(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Action ID is required' },
        { status: 400 }
      );
    }

    // Validate allowed fields
    const allowedFields = [
      'status',
      'metrics',
      'metrics_b',
      'ab_winner',
      'learnings',
      'executed_at',
      'reviewed_at',
      'content',
      'content_b',
      'priority',
    ];

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        sanitized[key] = value;
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    // Auto-set timestamps based on status changes
    if (sanitized.status === 'published' && !sanitized.executed_at) {
      sanitized.executed_at = new Date().toISOString();
    }
    if (sanitized.status === 'completed' && !sanitized.reviewed_at) {
      sanitized.reviewed_at = new Date().toISOString();
    }

    // Auto-evaluate A/B winner if both metrics are provided
    if (sanitized.metrics && sanitized.metrics_b && !sanitized.ab_winner) {
      const metricsA = sanitized.metrics as Record<string, number>;
      const metricsB = sanitized.metrics_b as Record<string, number>;

      const impressionThreshold = 100;
      if (
        (metricsA.impressions ?? 0) >= impressionThreshold &&
        (metricsB.impressions ?? 0) >= impressionThreshold
      ) {
        const scoreA =
          (metricsA.engagement_rate ?? 0) * 0.4 +
          (metricsA.conversions ?? 0) * 0.4 +
          (metricsA.shares ?? 0) * 0.2;
        const scoreB =
          (metricsB.engagement_rate ?? 0) * 0.4 +
          (metricsB.conversions ?? 0) * 0.4 +
          (metricsB.shares ?? 0) * 0.2;

        sanitized.ab_winner = scoreA >= scoreB ? 'a' : 'b';
        sanitized.learnings = `Auto-selected: Variant ${(sanitized.ab_winner as string).toUpperCase()} won. Score A: ${scoreA.toFixed(2)}, Score B: ${scoreB.toFixed(2)}`;
      }
    }

    const { data, error } = await supabase
      .from('growth_actions')
      .update(sanitized)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, action: data });
  } catch (err) {
    console.error('[GrowthActions API] PATCH error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

// DELETE: Remove action
export async function DELETE(request: NextRequest) {
  try {
    const adminError = await requireAdminApi(request);
    if (adminError) return adminError;

    const supabase = getSupabase();
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Supabase not configured' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Action ID is required (pass as ?id=...)' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('growth_actions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (err) {
    console.error('[GrowthActions API] DELETE error:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
