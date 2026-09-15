import { NextRequest, NextResponse } from "next/server";

/**
 * The old Gmail callback stored a global plaintext refresh token under
 * brand_settings._system. It is intentionally retired. New Gmail connections
 * use /api/oauth/google/callback with encrypted, brand-scoped tokens.
 */
export async function GET(req: NextRequest) {
  const target = new URL("/nexus-os/communications", req.nextUrl.origin);
  target.searchParams.set("oauth_error", "legacy_gmail_callback_disabled");
  return NextResponse.redirect(target);
}
