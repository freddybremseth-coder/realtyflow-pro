/**
 * GET /api/oauth/google/diagnose
 *
 * Walks every `brand_settings` row that has a `youtube_refresh_token`, tries to
 * exchange it for an access token, and then calls `/youtube/v3/channels?mine=true`
 * to find which YouTube channel the token actually belongs to.
 *
 * Intended to diagnose "invalid_grant" errors caused by per-brand tokens that
 * were accidentally issued from the wrong Google account — a common mistake
 * is running `/api/oauth/google?brand=zeneco` while still logged in with the
 * Re-Master Freddy Google account.
 *
 * Response shape (per brand row):
 *   {
 *     brand_id: "zeneco",
 *     token_present: true,
 *     exchange_ok: true,                     // refresh→access token worked
 *     channels: [{ id, title, customUrl }],  // channels the token actually owns
 *     error: null | string,
 *     hint: null | string                    // Norwegian user-facing hint
 *   }
 *
 * Does NOT mutate anything — safe to hit repeatedly.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface BrandRow {
  brand_id: string;
  settings: Record<string, unknown> | null;
}

async function exchangeRefreshToken(refreshToken: string): Promise<{ access_token?: string; error?: string }> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { error: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET missing' };
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const body = await res.json();
    if (body.error) return { error: `${body.error}${body.error_description ? `: ${body.error_description}` : ''}` };
    return { access_token: body.access_token };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function listMyChannels(accessToken: string): Promise<{ channels?: Array<{ id: string; title: string; customUrl?: string }>; error?: string }> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const body = await res.json();
    if (body.error) return { error: body.error.message || 'channels.list failed' };
    const items = body.items || [];
    const channels = items.map((c: { id: string; snippet: { title: string; customUrl?: string } }) => ({
      id: c.id,
      title: c.snippet.title,
      customUrl: c.snippet.customUrl,
    }));
    return { channels };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

function sanitize(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const supabase = createClient(url, key);
  const { data, error } = await supabase
    .from('brand_settings')
    .select('brand_id, settings');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as BrandRow[];
  const withToken = rows.filter((r) => sanitize(r.settings?.youtube_refresh_token));

  // Check env-level token too, labelled as env:YOUTUBE_REFRESH_TOKEN
  const envToken = sanitize(process.env.YOUTUBE_REFRESH_TOKEN);

  const checks: Array<{
    brand_id: string;
    token_present: boolean;
    token_length: number;
    had_whitespace: boolean;
    exchange_ok: boolean;
    channels: Array<{ id: string; title: string; customUrl?: string }>;
    error: string | null;
    hint: string | null;
  }> = [];

  // Per-brand rows
  for (const row of withToken) {
    const rawToken = row.settings?.youtube_refresh_token as string;
    const clean = sanitize(rawToken);
    const hadWhitespace = clean !== rawToken;

    const exchange = await exchangeRefreshToken(clean);
    if (exchange.error || !exchange.access_token) {
      let hint = `Token kan ikke fornyes (${exchange.error}). Kjør /api/oauth/google?brand=${row.brand_id} med riktig Google-konto.`;
      if (exchange.error?.includes('invalid_grant')) {
        hint = `Token er revoked/utløpt. Kjør /api/oauth/google?brand=${row.brand_id} mens du er logget inn med den Google-kontoen som eier kanalen.`;
      }
      checks.push({
        brand_id: row.brand_id,
        token_present: true,
        token_length: clean.length,
        had_whitespace: hadWhitespace,
        exchange_ok: false,
        channels: [],
        error: exchange.error || 'No access token returned',
        hint,
      });
      continue;
    }

    const channelsRes = await listMyChannels(exchange.access_token);
    if (channelsRes.error || !channelsRes.channels) {
      checks.push({
        brand_id: row.brand_id,
        token_present: true,
        token_length: clean.length,
        had_whitespace: hadWhitespace,
        exchange_ok: true,
        channels: [],
        error: channelsRes.error || 'channels.list failed',
        hint: `Token fornyes OK, men klarte ikke hente kanal-info (${channelsRes.error}).`,
      });
      continue;
    }

    const channels = channelsRes.channels;
    let hint: string | null = null;
    if (channels.length === 0) {
      hint = `Tokenet har ingen YouTube-kanal. Brukeren som autoriserte har ikke YouTube-kanal.`;
    } else {
      const primary = channels[0];
      // Fuzzy check: does channel title contain brand_id fragment? Just informational.
      const looksMismatched =
        !primary.title.toLowerCase().includes(row.brand_id.toLowerCase()) &&
        !(primary.customUrl || '').toLowerCase().includes(row.brand_id.toLowerCase());
      if (looksMismatched) {
        hint = `⚠️ Kanalen (${primary.title}) ser ikke ut til å matche brand_id "${row.brand_id}". Hvis dette er feil kanal, kjør /api/oauth/google?brand=${row.brand_id} mens du er logget inn med riktig Google-konto.`;
      }
    }

    checks.push({
      brand_id: row.brand_id,
      token_present: true,
      token_length: clean.length,
      had_whitespace: hadWhitespace,
      exchange_ok: true,
      channels,
      error: null,
      hint,
    });
  }

  // Env-level fallback
  if (envToken) {
    const exchange = await exchangeRefreshToken(envToken);
    if (exchange.error || !exchange.access_token) {
      checks.push({
        brand_id: 'env:YOUTUBE_REFRESH_TOKEN',
        token_present: true,
        token_length: envToken.length,
        had_whitespace: false,
        exchange_ok: false,
        channels: [],
        error: exchange.error || 'No access token returned',
        hint: 'Env-fallback-token er ugyldig. Oppdater YOUTUBE_REFRESH_TOKEN i Vercel, eller kjør /api/oauth/google (uten brand).',
      });
    } else {
      const c = await listMyChannels(exchange.access_token);
      checks.push({
        brand_id: 'env:YOUTUBE_REFRESH_TOKEN',
        token_present: true,
        token_length: envToken.length,
        had_whitespace: false,
        exchange_ok: true,
        channels: c.channels || [],
        error: c.error || null,
        hint: null,
      });
    }
  }

  const problems = checks.filter((c) => !c.exchange_ok || c.hint !== null);

  return NextResponse.json({
    checkedCount: checks.length,
    problemCount: problems.length,
    summary:
      problems.length === 0
        ? `Alle ${checks.length} YouTube-tokens er gyldige.`
        : `${problems.length} av ${checks.length} tokens trenger oppmerksomhet.`,
    checks,
  });
}
