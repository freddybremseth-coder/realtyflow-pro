import { NextRequest, NextResponse } from "next/server";

// ─── Step 1: Redirect user to Facebook OAuth ─────────────────────
// GET /api/oauth/facebook?brand=soleada
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") || "soleada";
  const appId = process.env.FACEBOOK_APP_ID;

  if (!appId) {
    return NextResponse.json(
      { error: "FACEBOOK_APP_ID ikke konfigurert" },
      { status: 500 }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/oauth/facebook/callback`;

  // Request permissions for pages + instagram
  // Note: Advanced permissions (pages_manage_posts, instagram_content_publish, etc.)
  // must be added in Meta Developer Dashboard → App Review → Permissions and Features
  // before they can be requested in the OAuth flow.
  const scope = [
    "pages_show_list",
    "pages_read_engagement",
  ].join(",");

  const state = JSON.stringify({ brand });

  const authUrl = new URL("https://www.facebook.com/v19.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
