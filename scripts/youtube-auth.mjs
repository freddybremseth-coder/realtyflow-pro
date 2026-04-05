#!/usr/bin/env node
/**
 * YouTube OAuth2 Helper
 * Kjør: node scripts/youtube-auth.mjs
 *
 * Starter en lokal server, åpner nettleseren for Google-innlogging,
 * og viser refresh token når du er ferdig.
 */

import http from 'http';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Try to load from .env.local
let CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
let CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of envFile.split('\n')) {
      const [key, ...vals] = line.split('=');
      const value = vals.join('=').trim().replace(/^["']|["']$/g, '');
      if (key?.trim() === 'YOUTUBE_CLIENT_ID') CLIENT_ID = value;
      if (key?.trim() === 'YOUTUBE_CLIENT_SECRET') CLIENT_SECRET = value;
    }
  } catch (e) {}
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Mangler YOUTUBE_CLIENT_ID og/eller YOUTUBE_CLIENT_SECRET');
  console.error('   Legg dem i .env.local eller sett som miljøvariabler\n');
  process.exit(1);
}

const PORT = 8976;
const REDIRECT_URI = `https://social-media-hub-ai-agents.vercel.app/api/youtube/oauth-callback`;
const SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

const AUTH_URL = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<html><body style="font-family:system-ui;padding:40px;background:#0f172a;color:#f1f5f9">
        <h1 style="color:#ef4444">❌ Feil: ${error}</h1>
        <p>Prøv igjen eller sjekk Google Cloud Console-innstillingene.</p>
      </body></html>`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Ingen kode mottatt</h1>');
      return;
    }

    // Exchange code for tokens
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
          <p style="color:#94a3b8">Sjekk at redirect URI <code style="color:#22d3ee">http://localhost:${PORT}/callback</code> er lagt til i Google Cloud Console.</p>
        </body></html>`);
        console.error('\n❌ Token-feil:', data);
        server.close();
        process.exit(1);
      }

      const refreshToken = data.refresh_token;

      // Success page
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
          <p style="color:#e2e8f0;margin:0">Legg denne inn som <code style="color:#22d3ee">YOUTUBE_REFRESH_TOKEN</code> i Vercel Environment Variables.</p>
        </div>
        <p style="color:#64748b;margin-top:24px;font-size:12px">Du kan lukke dette vinduet nå.</p>
      </body></html>`);

      console.log('\n✅ ═══════════════════════════════════════════');
      console.log('   YouTube OAuth2 vellykket!');
      console.log('═══════════════════════════════════════════════');
      console.log('\n📋 YOUTUBE_REFRESH_TOKEN:');
      console.log(`\n   ${refreshToken}\n`);
      console.log('═══════════════════════════════════════════════');
      console.log('   Legg denne inn i Vercel → Settings → Environment Variables');
      console.log('═══════════════════════════════════════════════\n');

      setTimeout(() => { server.close(); process.exit(0); }, 3000);

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>Serverfeil</h1><pre>${err.message}</pre>`);
      console.error('Feil:', err);
      server.close();
      process.exit(1);
    }
  } else {
    // Redirect to Google
    res.writeHead(302, { Location: AUTH_URL });
    res.end();
  }
});

server.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════════════');
  console.log('   🎵 Neural Beat - YouTube OAuth2 Setup');
  console.log('═══════════════════════════════════════════════');
  console.log(`\n   Redirect URI (legg til i Google Cloud Console):`);
  console.log(`   → http://localhost:${PORT}/callback\n`);
  console.log('   Åpner nettleseren...\n');

  // Open browser
  exec(`open "http://localhost:${PORT}"`, (err) => {
    if (err) {
      console.log(`   Åpne denne lenken manuelt:`);
      console.log(`   → http://localhost:${PORT}\n`);
    }
  });
});
