import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET /api/chatbot/sessions
 * Fetch chatbot conversations for viewing in the command center.
 *
 * Query params:
 *   brand - filter by brand_id
 *   limit - max results (default 50)
 *   lead_only - if "true", only show sessions with captured leads
 *   session_id - fetch a single session by ID
 */
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ sessions: [], error: 'Supabase not configured' });
  }

  const { searchParams } = new URL(request.url);
  const brand = searchParams.get('brand');
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const leadOnly = searchParams.get('lead_only') === 'true';
  const sessionId = searchParams.get('session_id');

  try {
    // Fetch single session
    if (sessionId) {
      const { data, error } = await supabase
        .from('chatbot_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      return NextResponse.json({ session: data });
    }

    // Fetch session list
    let query = supabase
      .from('chatbot_sessions')
      .select('id, session_id, brand_id, visitor_name, visitor_email, last_message, message_count, last_page, lead_captured, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (brand) query = query.eq('brand_id', brand);
    if (leadOnly) query = query.eq('lead_captured', true);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ sessions: [], error: error.message });
    }

    return NextResponse.json({ sessions: data || [] });
  } catch (err) {
    return NextResponse.json(
      { sessions: [], error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}
