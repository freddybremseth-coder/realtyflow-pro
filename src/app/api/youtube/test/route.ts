import { NextRequest, NextResponse } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/youtube/test?brandId=zeneco
 *
 * Tests YouTube OAuth2 token validity for a brand.
 * Returns token source, validity status, and channel info if valid.
 */
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId") || undefined;
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: "YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET not set",
    }, { status: 500 });
  }

  // 1. Find the token
  let refreshToken: string | null = null;
  let tokenSource = "none";

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createClient(url, key);

      // Check brand-specific
      if (brandId && brandId !== "_system") {
        const { data: brandData, error: brandErr } = await supabase
          .from("brand_settings")
          .select("settings")
          .eq("brand_id", brandId)
          .single();

        if (brandErr) {
          console.log(`[YouTube Test] Brand lookup error for ${brandId}:`, brandErr.message);
        }

        const brandToken = brandData?.settings?.youtube_refresh_token;
        if (brandToken) {
          refreshToken = brandToken;
          tokenSource = `brand_settings:${brandId}`;
        }
      }

      // Fall back to _system
      if (!refreshToken) {
        const { data } = await supabase
          .from("brand_settings")
          .select("settings")
          .eq("brand_id", "_system")
          .single();
        const sysToken = data?.settings?.youtube_refresh_token;
        if (sysToken) {
          refreshToken = sysToken;
          tokenSource = "brand_settings:_system";
        }
      }
    }
  } catch (err) {
    console.log("[YouTube Test] Supabase error:", err);
  }

  // Fall back to env var
  if (!refreshToken && process.env.YOUTUBE_REFRESH_TOKEN) {
    refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    tokenSource = "env:YOUTUBE_REFRESH_TOKEN";
  }

  if (!refreshToken) {
    return NextResponse.json({
      brandId: brandId || "(default)",
      tokenSource: "none",
      tokenFound: false,
      error: "No refresh token found anywhere",
    });
  }

  // 2. Test the token
  const oauth2 = new OAuth2Client(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  try {
    const { token } = await oauth2.getAccessToken();
    if (!token) {
      return NextResponse.json({
        brandId: brandId || "(default)",
        tokenSource,
        tokenFound: true,
        tokenPreview: refreshToken.substring(0, 10) + "...",
        valid: false,
        error: "getAccessToken returned null - token is likely expired or revoked",
      });
    }

    // 3. Try to get channel info to confirm it works
    const res = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const channel = data.items?.[0];

    return NextResponse.json({
      brandId: brandId || "(default)",
      tokenSource,
      tokenFound: true,
      tokenPreview: refreshToken.substring(0, 10) + "...",
      valid: true,
      channel: channel
        ? {
            id: channel.id,
            title: channel.snippet?.title,
            thumbnail: channel.snippet?.thumbnails?.default?.url,
          }
        : null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      brandId: brandId || "(default)",
      tokenSource,
      tokenFound: true,
      tokenPreview: refreshToken.substring(0, 10) + "...",
      valid: false,
      error: msg,
    });
  }
}
