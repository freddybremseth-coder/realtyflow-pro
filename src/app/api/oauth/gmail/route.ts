import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/oauth/gmail
 * Redirects to Google OAuth to get Gmail access (read-only).
 * Uses the same OAuth client as YouTube.
 */
export async function GET(req: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "YOUTUBE_CLIENT_ID not configured" }, { status: 500 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).trim().replace(/\\n/g, "");
  const redirectUri = `${appUrl}/api/oauth/gmail/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return NextResponse.redirect(authUrl.toString());
}
