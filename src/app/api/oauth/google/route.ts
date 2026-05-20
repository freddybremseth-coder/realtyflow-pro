import { NextRequest, NextResponse } from "next/server";

import { buildRedirectUri, getGoogleCredentials } from "@/lib/oauth/providers";
import { createState } from "@/lib/oauth/state";
import { normalizeBrandId } from "@/lib/realty/brand-rules";

/**
 * GET /api/oauth/google?brand_id=<id>&service=<youtube|drive>&return_to=<path>
 *
 * Phase 3 refactor of the YouTube OAuth start route. Differences from the old
 * version:
 *   - `brand_id` is REQUIRED. We refuse to start a flow that doesn't know
 *     which brand the resulting tokens belong to. The legacy `_system` /
 *     fuzzy fallback was the source of cross-brand contamination.
 *   - `state` is now a 32-byte hex nonce persisted in `oauth_states`. The
 *     callback verifies + consumes it (CSRF) and pulls the brand_id /
 *     return_to back out of the row instead of trusting an unsigned
 *     base64-JSON blob in the URL.
 *   - Backwards compatible with the old query name `?brand=...` so existing
 *     bookmarks and the current settings UI keep working through the
 *     transition.
 *
 * After consent, the callback fetches `youtube.channels.list({mine: true})`
 * and either auto-finalizes (when there's exactly one channel) or sends the
 * user to /oauth/select to pick which channel goes to which brand.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  // Accept both new and legacy param names. New code should use `brand_id`.
  const rawBrandId = (params.get("brand_id") || params.get("brand") || "").trim();
  const brandId = normalizeBrandId(rawBrandId);
  if (!brandId) {
    return NextResponse.json(
      { error: "brand_id is required. Use /api/oauth/google?brand_id=<id>" },
      { status: 400 },
    );
  }

  const service = (params.get("service") || "youtube").trim();
  const returnTo = params.get("return_to") || "/settings?tab=sosiale-medier";

  let credentials;
  try {
    credentials = getGoogleCredentials();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Google OAuth not configured" },
      { status: 500 },
    );
  }

  const redirectUri = buildRedirectUri("google", req.nextUrl.origin);

  // Scope set is YouTube-by-default with optional Drive add-on. We never
  // request Gmail-write here — that's a separate provider (gmail) so the
  // user can grant mail scopes independently.
  const youtubeOnly = service === "youtube";
  const scopes = [
    "https://www.googleapis.com/auth/youtube",
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
    ...(!youtubeOnly ? ["https://www.googleapis.com/auth/drive.file"] : []),
  ];

  // Persist the in-flight state. The callback will look the row up by nonce.
  let stateNonce: string;
  try {
    stateNonce = await createState({
      brandId,
      platform: service === "drive" ? "google_drive" : "youtube",
      returnTo,
      metadata: { service },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start OAuth flow" },
      { status: 500 },
    );
  }

  console.log(
    `[Google OAuth] start brand=${brandId} service=${service} redirect_uri=${redirectUri}`,
  );

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  // `prompt=consent` is needed because Google only issues a refresh_token on
  // the FIRST consent. Without this, re-running the flow for a brand that
  // had already been consented returns access_token without refresh_token,
  // leaving us unable to renew when the access token expires in an hour.
  authUrl.searchParams.set("prompt", "consent");
  // `include_granted_scopes` lets the user incrementally add scopes without
  // losing previously-granted ones (e.g. add Drive after originally just
  // YouTube).
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", stateNonce);

  return NextResponse.redirect(authUrl.toString());
}
