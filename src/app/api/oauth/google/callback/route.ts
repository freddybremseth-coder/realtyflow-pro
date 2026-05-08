import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/oauth/google/callback
 * Exchanges auth code for tokens, stores refresh token in Supabase under the
 * brand encoded in `state` (default `_system`), and tries to update Vercel
 * env when writing the system-level token.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const stateRaw = req.nextUrl.searchParams.get("state");

  // Decode `state` to recover the brand this OAuth flow was initiated for.
  // Falls back to `_system` so existing bookmarks / old flows still work.
  let brandId = "_system";
  let service = "youtube";
  if (stateRaw) {
    try {
      const parsed = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
      if (parsed?.brand && typeof parsed.brand === "string") {
        brandId = parsed.brand.trim() || "_system";
      }
      if (parsed?.service && typeof parsed.service === "string") {
        service = parsed.service.trim() || "youtube";
      }
    } catch {
      // Ignore malformed state; fall through to _system
    }
  }

  if (error) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=${encodeURIComponent(error)}&brand=${encodeURIComponent(brandId)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=no_code&brand=${encodeURIComponent(brandId)}`
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
        `${req.nextUrl.origin}/settings?youtube_error=no_refresh_token&brand=${encodeURIComponent(brandId)}`
      );
    }

    console.log(`[Google OAuth] ✅ Got new refresh token for brand "${brandId}"`);

    // Merge (don't overwrite) existing settings for this brand so we don't
    // clobber unrelated keys like IG handle / FB page / etc.
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: existing } = await supabase
      .from("brand_settings")
      .select("settings")
      .eq("brand_id", brandId)
      .maybeSingle();

    const mergedSettings = {
      ...(existing?.settings || {}),
      youtube_refresh_token: tokenData.refresh_token,
      ...(service === "drive" ? { google_drive_refresh_token: tokenData.refresh_token } : {}),
    };

    const { error: upsertErr } = await supabase.from("brand_settings").upsert(
      {
        brand_id: brandId,
        settings: mergedSettings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "brand_id" },
    );

    if (upsertErr) {
      console.error(`[Google OAuth] Failed to persist token for brand "${brandId}":`, upsertErr);
      return NextResponse.redirect(
        `${req.nextUrl.origin}/settings?youtube_error=persist_failed&brand=${encodeURIComponent(brandId)}`
      );
    }

    // Only mirror to Vercel env var when this is the system/default token —
    // per-brand tokens should NOT overwrite the global fallback env var.
    if (brandId === "_system") {
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
    }

    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_success=true&brand=${encodeURIComponent(brandId)}&refresh_token=${encodeURIComponent(tokenData.refresh_token)}`
    );
  } catch (err) {
    console.error("[Google OAuth] Token exchange failed:", err);
    return NextResponse.redirect(
      `${req.nextUrl.origin}/settings?youtube_error=token_exchange_failed&brand=${encodeURIComponent(brandId)}`
    );
  }
}
