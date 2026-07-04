import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${req.nextUrl.origin}/settings?gmail_error=${encodeURIComponent(error || "no_code")}`);
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID!;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).trim().replace(/\\n/g, "");
  const redirectUri = `${appUrl}/api/oauth/gmail/callback`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenData.refresh_token) {
      return NextResponse.redirect(`${req.nextUrl.origin}/settings?gmail_error=no_refresh_token`);
    }

    // Store Gmail refresh token in brand_settings _system
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.redirect(`${req.nextUrl.origin}/settings?gmail_error=supabase_not_configured`);
    }

    const supabase = createClient(url, key);

    // Get current _system settings and merge
    const { data: existing } = await supabase.from("brand_settings").select("settings").eq("brand_id", "_system").single();
    const merged = { ...(existing?.settings || {}), gmail_refresh_token: tokenData.refresh_token };

    await supabase.from("brand_settings").upsert({
      brand_id: "_system",
      settings: merged,
      updated_at: new Date().toISOString(),
    }, { onConflict: "brand_id" });

    console.log("[Gmail OAuth] ✅ Gmail refresh token stored");
    return NextResponse.redirect(`${req.nextUrl.origin}/settings?gmail_success=true`);
  } catch (err) {
    console.error("[Gmail OAuth] Failed:", err);
    return NextResponse.redirect(`${req.nextUrl.origin}/settings?gmail_error=token_exchange_failed`);
  }
}
