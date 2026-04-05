import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/oauth/google/callback
 * Exchanges auth code for tokens, stores refresh token in Supabase,
 * and updates the environment.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=no_code`
    );
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).trim().replace(/\\n/g, '');
  const redirectUri = `${appUrl}/api/oauth/google/callback`;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      console.error("[Google OAuth] No refresh token received:", tokenData);
      return NextResponse.redirect(
        `${req.nextUrl.origin}/settings?youtube_error=no_refresh_token`
      );
    }

    console.log("[Google OAuth] ✅ Got new refresh token!");
    console.log("[Google OAuth] Refresh token:", tokenData.refresh_token);

    // Store in Supabase for persistence
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    await supabase.from("brand_settings").upsert({
      brand_id: "_system",
      settings: { youtube_refresh_token: tokenData.refresh_token },
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id" });

    // Also try to update Vercel env var via API (if token is available)
    const vercelToken = process.env.VERCEL_TOKEN;
    const vercelProjectId = process.env.VERCEL_PROJECT_ID;
    if (vercelToken && vercelProjectId) {
      try {
        await fetch(`https://api.vercel.com/v10/projects/${vercelProjectId}/env`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${vercelToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: "YOUTUBE_REFRESH_TOKEN",
            value: tokenData.refresh_token,
            type: "encrypted",
            target: ["production", "preview"],
          }),
        });
      } catch (e) {
        console.error("[Google OAuth] Could not update Vercel env:", e);
      }
    }

    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_success=true&refresh_token=${encodeURIComponent(tokenData.refresh_token)}`
    );
  } catch (err) {
    console.error("[Google OAuth] Token exchange failed:", err);
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=token_exchange_failed`
    );
  }
}
