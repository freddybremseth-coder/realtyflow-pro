import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri, getLinkedInCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";

/**
 * GET /api/oauth/linkedin?brand_id=<id>&return_to=<path>
 *
 * Phase 3.5: LinkedIn brought into the same state-nonce + per-brand binding
 * pattern as Google and Meta. The callback writes a `social_channels` row
 * for the authorized member URN and stores tokens encrypted in
 * `oauth_tokens`.
 *
 * LinkedIn's OAuth is the simplest of the three:
 *   - One auth subject = one channel (their member profile). No equivalent
 *     of "pick a Page" or "pick a YouTube channel" — Page-level posting
 *     uses Marketing Developer Platform access (`w_organization_social`)
 *     which we don't request here. If/when we add Company Page posting,
 *     this route will need a picker like Meta's.
 *   - Tokens DO have a refresh token in newer apps, but only when the app
 *     has Marketing Developer access. For OpenID Connect / userinfo apps,
 *     LinkedIn returns access_token only with `expires_in` ~60 days. We
 *     persist whatever the response gives us.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const brandId = (params.get("brand_id") || params.get("brand") || "").trim();
  if (!brandId) {
    return NextResponse.json(
      { error: "brand_id is required. Use /api/oauth/linkedin?brand_id=<id>" },
      { status: 400 },
    );
  }
  const returnTo = params.get("return_to") || "/settings?tab=sosiale-medier";

  let credentials;
  try {
    credentials = getLinkedInCredentials();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "LinkedIn OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = buildRedirectUri("linkedin", req.nextUrl.origin);

  // openid + profile + email give us userinfo for display name/email.
  // w_member_social is the posting scope for the authenticated member's feed.
  const scope = "openid profile email w_member_social";

  const stateNonce = await createState({
    brandId,
    platform: "linkedin",
    returnTo,
    metadata: {},
  });

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", stateNonce);

  return NextResponse.redirect(authUrl.toString());
}
