import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/oauth/google?brand=xxx
 *
 * Redirects to Google OAuth to get a new YouTube refresh token.
 * The optional `brand` query parameter is passed through via the OAuth `state`
 * parameter so the callback can persist the token under the right
 * `brand_settings` row (brand-specific) instead of always `_system`.
 *
 * Examples:
 *   /api/oauth/google                  → token stored as _system (default)
 *   /api/oauth/google?brand=zeneco     → token stored under brand_id=zeneco
 *   /api/oauth/google?brand=remaster   → token stored under brand_id=remaster
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "YOUTUBE_CLIENT_ID not configured" }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).trim().replace(/\\n/g, '');
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  // Pass brand through via OAuth state so the callback can route the token
  // to the correct brand_settings row. Default: _system (global fallback).
  const brand = (req.nextUrl.searchParams.get("brand") || "_system").trim();
  const state = Buffer.from(JSON.stringify({ brand })).toString("base64url");

  console.log(`[Google OAuth] redirect_uri: ${redirectUri}, brand: ${brand}`);
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/drive.file");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // Force new refresh token
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
