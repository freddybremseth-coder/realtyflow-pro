import { NextRequest, NextResponse } from "next/server";

// GET /api/oauth/linkedin?brand=soleada
export async function GET(req: NextRequest) {
  const brand = req.nextUrl.searchParams.get("brand") || "soleada";
  const clientId = process.env.LINKEDIN_CLIENT_ID;

  if (!clientId) {
    return NextResponse.json(
      { error: "LINKEDIN_CLIENT_ID ikke konfigurert" },
      { status: 500 }
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/api/oauth/linkedin/callback`;

  const scope = "openid profile w_member_social";
  const state = JSON.stringify({ brand });

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
