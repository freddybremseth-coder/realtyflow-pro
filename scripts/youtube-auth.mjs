#!/usr/bin/env node
/**
 * YouTube OAuth2 Helper (developer-only fallback)
 *
 *   node scripts/youtube-auth.mjs
 *
 * Starts a local HTTP server on port 8976, opens the browser, walks you
 * through Google's OAuth consent, and prints the resulting refresh token.
 *
 * Why this script still exists in a repo that has a full Phase-3 OAuth flow:
 *   - It's the easiest way to get a YouTube refresh token without running
 *     the full Next.js app (e.g. when bootstrapping a new env, debugging
 *     channel-list permissions, or generating a one-off token for a script).
 *   - Tokens it produces are NOT written into the new oauth_tokens table —
 *     they're only printed to the terminal. You'd then either paste them
 *     into Vercel as YOUTUBE_REFRESH_TOKEN (legacy fallback path) or use
 *     the new Settings UI for a proper per-channel binding.
 *
 * Bug fixed in this revision:
 *   The previous version hardcoded
 *     REDIRECT_URI = https://social-media-hub-ai-agents.vercel.app/api/youtube/oauth-callback
 *   while the local listener served `/callback` on port 8976. Google never
 *   reached the local server, so the script could never complete locally.
 *   The redirect URI now matches the local listener byte-for-byte.
 *
 * What you need in Google Cloud Console:
 *   APIs & Services → Credentials → your OAuth 2.0 Client ID →
 *   "Authorized redirect URIs" must include:
 *     http://localhost:8976/callback
 *
 * Env vars:
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  (preferred)
 *   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET  (deprecated fallback)
 *   Read from .env.local if not set in the shell.
 */

import { exec } from 'child_process';
import { readFileSync } from 'fs';
import http from 'http';
import { resolve } from 'path';

const PORT = 8976;
const REDIRECT_PATH = '/callback';
// CRITICAL: REDIRECT_URI must EXACTLY match the path the local server
// listens on AND match an "Authorized redirect URI" in Google Cloud Console.
// Google rejects the token exchange with "redirect_uri_mismatch" if even
// the trailing slash differs.
const REDIRECT_URI = `http://localhost:${PORT}${REDIRECT_PATH}`;

const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

// ─── Resolve client credentials ─────────────────────────────────────────────
// Prefer the canonical GOOGLE_* names but accept the legacy YOUTUBE_* names
// so this script keeps working in setups that haven't been renamed yet.
let CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
let CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  // Fall back to .env.local. We can't use dotenv-cli without adding a dep
  // for a dev-only script, so do a tiny hand-rolled parser.
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const [key, ...vals] = line.split('=');
      const value = vals.join('=').trim().replace(/^["']|["']$/g, '');
      const k = key?.trim();
      if (!k || !value) continue;
      if (!CLIENT_ID && (k === 'GOOGLE_CLIENT_ID' || k === 'YOUTUBE_CLIENT_ID')) CLIENT_ID = value;
      if (!CLIENT_SECRET && (k === 'GOOGLE_CLIENT_SECRET' || k === 'YOUTUBE_CLIENT_SECRET')) CLIENT_SECRET = value;
    }
  } catch {
    // .env.local missing — fall through to the missing-creds error below.
  }
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Mangler GOOGLE_CLIENT_ID og/eller GOOGLE_CLIENT_SECRET');
  console.error('   Legg dem i .env.local eller sett som miljøvariabler.');
  console.error('   Kommando:  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/youtube-auth.mjs\n');
  process.exit(1);
}

const AUTH_URL =
  `https://accounts.google.com/o/oauth2/v2/auth` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Anything that isn't /callback redirects the browser to Google.
  if (url.pathname !== REDIRECT_PATH) {
    res.writeHead(302, { Location: AUTH_URL });
    res.end();
    return;
  }

  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f1f5f9">
      <h1 style="color:#ef4444">❌ Feil: ${error}</h1>
      <p>Sjekk Google Cloud Console-innstillingene. Authorized redirect URI må være:
      <code style="color:#22d3ee">${REDIRECT_URI}</code></p>
    </body></html>`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Ingen kode mottatt</h1>');
    return;
  }

  // ─── Exchange code for tokens ──────────────────────────────────────────
  // The redirect_uri sent here must EXACTLY match the one used at authorize
  // time — Google validates byte-for-byte. We use the same constant for both,
  // so they can't drift.
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const data = await tokenRes.json();

    if (data.error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f1f5f9">
        <h1 style="color:#ef4444">❌ Token-feil</h1>
        <pre style="background:#1e293b;padding:20px;border-radius:8px;color:#fbbf24">${JSON.stringify(data, null, 2)}</pre>
        <p style="color:#94a3b8">Sørg for at redirect URI <code style="color:#22d3ee">${REDIRECT_URI}</code> er lagt til i Google Cloud Console under Authorized redirect URIs.</p>
      </body></html>`);
      console.error('\n❌ Token-feil:', data);
      server.close();
      process.exit(1);
    }

    const refreshToken = data.refresh_token;
    if (!refreshToken) {
      // Google only issues refresh_token on FIRST consent. If the user
      // already consented previously without revoking the app, the token
      // exchange returns access_token only. `prompt=consent` above is meant
      // to force re-consent — if you still hit this, manually revoke the
      // app at https://myaccount.google.com/permissions and try again.
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f1f5f9">
        <h1 style="color:#fbbf24">⚠ Ingen refresh_token i svar</h1>
        <p>Google returnerte bare access_token. Revoker appen på
        <a href="https://myaccount.google.com/permissions" style="color:#22d3ee">myaccount.google.com/permissions</a>
        og prøv igjen.</p>
      </body></html>`);
      console.error('\n⚠ Ingen refresh_token — revoker appen og prøv igjen.');
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f1f5f9;max-width:800px;margin:0 auto">
      <h1 style="color:#22d3ee">✅ YouTube er tilkoblet!</h1>
      <h3 style="color:#94a3b8">Din Refresh Token:</h3>
      <div style="background:#1e293b;padding:20px;border-radius:8px;border:1px solid #334155;word-break:break-all">
        <code id="token" style="color:#4ade80;font-size:14px">${refreshToken}</code>
      </div>
      <button onclick="navigator.clipboard.writeText(document.getElementById('token').textContent);this.textContent='✅ Kopiert!'"
        style="margin-top:16px;padding:12px 24px;background:#0891b2;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px">
        📋 Kopier til utklippstavle
      </button>
      <div style="margin-top:24px;padding:16px;background:#1e293b;border-radius:8px;border-left:4px solid #22d3ee">
        <p style="color:#e2e8f0;margin:0">For produksjon, bruk Settings → Sosiale medier i appen heller for å lagre dette per-merkevare i <code>oauth_tokens</code>. Denne tokenen kan også settes som <code>YOUTUBE_REFRESH_TOKEN</code> i Vercel som siste fallback.</p>
      </div>
      <p style="color:#64748b;margin-top:24px;font-size:12px">Du kan lukke dette vinduet nå.</p>
    </body></html>`);

    console.log('\n✅ ═══════════════════════════════════════════');
    console.log('   YouTube OAuth2 vellykket!');
    console.log('═══════════════════════════════════════════════');
    console.log('\n📋 Refresh token:');
    console.log(`\n   ${refreshToken}\n`);
    console.log('═══════════════════════════════════════════════');
    console.log('   For per-merkevare-binding, bruk Settings → Sosiale medier');
    console.log('   i appen. Som siste fallback kan du sette tokenen som');
    console.log('   YOUTUBE_REFRESH_TOKEN i Vercel.');
    console.log('═══════════════════════════════════════════════\n');

    setTimeout(() => {
      server.close();
      process.exit(0);
    }, 3000);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>Serverfeil</h1><pre>${err.message}</pre>`);
    console.error('Feil:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════════════');
  console.log('   🎵 YouTube OAuth2 Setup (developer-only)');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n   Lytter på:    ${REDIRECT_URI.replace(REDIRECT_PATH, '')}`);
  console.log(`   Redirect URI: ${REDIRECT_URI}`);
  console.log('\n   Sørg for at denne redirect URI er lagt til i');
  console.log('   Google Cloud Console → Credentials → OAuth Client.');
  console.log('\n   Åpner nettleseren …\n');

  // `open` is mac-specific — fall back to stdout on other OSes.
  exec(`open "http://localhost:${PORT}"`, (err) => {
    if (err) {
      console.log('   Åpne denne lenken manuelt:');
      console.log(`   → http://localhost:${PORT}\n`);
    }
  });
});
