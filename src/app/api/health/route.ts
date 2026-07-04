/**
 * GET /api/health
 *
 * Pings every critical external dependency and reports which are broken.
 * Intended for rapid diagnosis when a UI shows "failed to fetch" and you don't
 * know whether it's YouTube, Anthropic, Supabase, or Facebook that's down.
 *
 * Everything returns HTTP 200 with per-check results — callers can read the
 * summary and know immediately which env var needs re-setting.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdminApi } from '@/lib/api-admin';

export const maxDuration = 30;

interface Check {
  name: string;
  ok: boolean;
  status?: number;
  error?: string;
  hint?: string;
}

async function checkEnv(keys: string[]): Promise<Check[]> {
  return keys.map((k) => {
    const v = process.env[k];
    return {
      name: `env:${k}`,
      ok: !!v && v.length > 4,
      error: !v ? 'missing' : v.length <= 4 ? 'too short' : undefined,
      hint: !v ? 'Legg til i Vercel → Environment Variables' : undefined,
    };
  });
}

async function checkAnthropic(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { name: 'anthropic', ok: false, error: 'ANTHROPIC_API_KEY missing' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    if (res.ok) return { name: 'anthropic', ok: true, status: res.status };
    const body = await res.text();
    return {
      name: 'anthropic',
      ok: false,
      status: res.status,
      error: body.substring(0, 200),
      hint: res.status === 401 ? 'ANTHROPIC_API_KEY ugyldig/utløpt — lag ny i Anthropic Console og oppdater Vercel' : undefined,
    };
  } catch (err) {
    return { name: 'anthropic', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkYouTube(): Promise<Check> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return {
      name: 'youtube',
      ok: false,
      error: 'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN missing',
    };
  }
  try {
    // Exchange refresh token for access token — if this fails, the refresh
    // token is revoked/invalid and uploads will fail.
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (res.ok) return { name: 'youtube', ok: true, status: res.status };
    const body = await res.text();
    return {
      name: 'youtube',
      ok: false,
      status: res.status,
      error: body.substring(0, 200),
      hint: 'Refresh token er ugyldig. Kjør OAuth-flyten på nytt for YouTube-kanalen.',
    };
  } catch (err) {
    return { name: 'youtube', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkSupabase(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { name: 'supabase', ok: false, error: 'URL or key missing' };
  try {
    const supabase = createClient(url, key);
    const { error } = await supabase.from('social_accounts').select('id').limit(1);
    if (error) return { name: 'supabase', ok: false, error: error.message };
    return { name: 'supabase', ok: true };
  } catch (err) {
    return { name: 'supabase', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function checkFacebookApp(): Promise<Check> {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return { name: 'facebook-app', ok: false, error: 'FACEBOOK_APP_ID or FACEBOOK_APP_SECRET missing' };
  }
  try {
    // App-access-token endpoint — cheapest way to validate app_id+app_secret
    const res = await fetch(
      `https://graph.facebook.com/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&grant_type=client_credentials`,
    );
    if (res.ok) return { name: 'facebook-app', ok: true };
    const body = await res.text();
    return {
      name: 'facebook-app',
      ok: false,
      status: res.status,
      error: body.substring(0, 200),
      hint: 'FACEBOOK_APP_SECRET er ugyldig. Bytt i Facebook Developers → App → Basic Settings, oppdater Vercel.',
    };
  } catch (err) {
    return { name: 'facebook-app', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: NextRequest) {
  const adminError = await requireAdminApi(request);
  if (adminError) return adminError;

  const envChecks = await checkEnv([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'ANTHROPIC_API_KEY',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REFRESH_TOKEN',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
  ]);

  const [anthropic, youtube, supabase, facebook] = await Promise.all([
    checkAnthropic(),
    checkYouTube(),
    checkSupabase(),
    checkFacebookApp(),
  ]);

  const all: Check[] = [...envChecks, anthropic, youtube, supabase, facebook];
  const broken = all.filter((c) => !c.ok);

  return NextResponse.json({
    ok: broken.length === 0,
    brokenCount: broken.length,
    summary:
      broken.length === 0
        ? 'Alle tjenester fungerer.'
        : `${broken.length} tjenester feiler: ${broken.map((c) => c.name).join(', ')}`,
    checks: all,
  });
}
